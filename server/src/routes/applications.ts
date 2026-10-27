import { Router } from 'express';
import fs from 'node:fs/promises';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { HttpError, wrap } from '../errors.js';
import { requireAuth, requireRole } from '../auth.js';
import { assertValidPdf, deleteResume, resumePath, saveResume } from '../storage.js';
import { STATUS_LABEL, TRANSITIONS, canTransition } from '../pipeline.js';

export const applicationsRouter = Router();
applicationsRouter.use(requireAuth);

// Files stay in memory until fully validated; nothing touches disk before the checks pass.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1, fields: 5, parts: 8 },
});

const applySchema = z.object({
  coverLetter: z.string().trim().max(5000).optional(),
});

const historyInclude = {
  orderBy: { createdAt: 'asc' },
  select: { id: true, fromStatus: true, toStatus: true, createdAt: true },
} as const;

/** Loads an application together with its job, and checks the caller is the employer owning that job. */
async function loadForEmployer(applicationId: string, employerId: string) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { job: { select: { id: true, title: true, employerId: true } } },
  });
  if (!app) throw new HttpError(404, 'Application not found', 'APPLICATION_NOT_FOUND');
  if (app.job.employerId !== employerId) {
    throw new HttpError(403, 'You do not have access to this application', 'FORBIDDEN');
  }
  return app;
}

// ---- Candidate: apply ---------------------------------------------------

applicationsRouter.post(
  '/jobs/:jobId/applications',
  requireRole('CANDIDATE'),
  upload.single('resume'),
  wrap(async (req, res) => {
    assertValidPdf(req.file);
    const { coverLetter } = applySchema.parse(req.body);
    const candidateId = req.user!.id;
    const jobId = req.params.jobId;

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new HttpError(404, 'Job not found', 'JOB_NOT_FOUND');
    if (job.status !== 'OPEN') throw new HttpError(409, 'This job is closed to applications', 'JOB_CLOSED');
    const existing = await prisma.application.findUnique({
      where: { jobId_candidateId: { jobId, candidateId } },
      select: { id: true },
    });
    if (existing) throw new HttpError(409, 'You have already applied to this job', 'ALREADY_APPLIED');

    const stored = await saveResume(req.file.buffer);
    try {
      const application = await prisma.$transaction(async (tx) => {
        // Re-check inside the transaction so a job closed in the meantime is still refused.
        const fresh = await tx.job.findUniqueOrThrow({ where: { id: jobId }, select: { status: true } });
        if (fresh.status !== 'OPEN') throw new HttpError(409, 'This job is closed to applications', 'JOB_CLOSED');
        const created = await tx.application.create({
          data: {
            jobId,
            candidateId,
            coverLetter: coverLetter || null,
            resumeFile: stored,
            resumeOriginalName: req.file!.originalname.replace(/[^\w.\- ]/g, '_').slice(0, 120),
            history: { create: { fromStatus: null, toStatus: 'APPLIED', changedById: candidateId } },
          },
          select: { id: true, status: true, jobId: true, createdAt: true },
        });
        await tx.notification.create({
          data: {
            userId: job.employerId,
            applicationId: created.id,
            message: `${req.user!.name} applied to "${job.title}"`,
          },
        });
        return created;
      });
      res.status(201).json({ application });
    } catch (e) {
      await deleteResume(stored).catch(() => undefined);
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new HttpError(409, 'You have already applied to this job', 'ALREADY_APPLIED');
      }
      throw e;
    }
  }),
);

// ---- Candidate: own applications ---------------------------------------

applicationsRouter.get(
  '/applications/mine',
  requireRole('CANDIDATE'),
  wrap(async (req, res) => {
    const items = await prisma.application.findMany({
      where: { candidateId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        job: { select: { id: true, title: true, location: true, type: true, status: true, employer: { select: { company: true } } } },
        history: historyInclude,
      },
    });
    res.json({ items });
  }),
);

// ---- Shared detail (candidate owner or job-owning employer) ------------

applicationsRouter.get(
  '/applications/:id',
  wrap(async (req, res) => {
    const app = await prisma.application.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        status: true,
        coverLetter: true,
        resumeOriginalName: true,
        createdAt: true,
        candidateId: true,
        candidate: { select: { id: true, name: true, email: true } },
        job: { select: { id: true, title: true, location: true, type: true, employerId: true } },
        history: historyInclude,
      },
    });
    if (!app) throw new HttpError(404, 'Application not found', 'APPLICATION_NOT_FOUND');
    const isOwnerEmployer = req.user!.role === 'EMPLOYER' && app.job.employerId === req.user!.id;
    const isCandidate = req.user!.role === 'CANDIDATE' && app.candidateId === req.user!.id;
    if (!isOwnerEmployer && !isCandidate) {
      throw new HttpError(403, 'You do not have access to this application', 'FORBIDDEN');
    }
    const { candidateId: _c, job: { employerId: _e, ...job }, ...rest } = app;
    res.json({
      application: { ...rest, job, allowedTransitions: isOwnerEmployer ? TRANSITIONS[app.status] : [] },
    });
  }),
);

// ---- Employer: pipeline, resume, notes ---------------------------------

const statusSchema = z.object({
  status: z.enum(['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'HIRED', 'REJECTED']),
});

applicationsRouter.patch(
  '/applications/:id/status',
  requireRole('EMPLOYER'),
  wrap(async (req, res) => {
    const { status: to } = statusSchema.parse(req.body);
    const employerId = req.user!.id;
    const app = await loadForEmployer(req.params.id, employerId);
    if (!canTransition(app.status, to)) {
      throw new HttpError(
        409,
        `Cannot move an application from ${STATUS_LABEL[app.status]} to ${STATUS_LABEL[to]}`,
        'INVALID_TRANSITION',
        { from: app.status, to, allowed: TRANSITIONS[app.status] },
      );
    }
    const updated = await prisma.$transaction(async (tx) => {
      // Conditional update guards against two concurrent changes from the same starting status.
      const { count } = await tx.application.updateMany({
        where: { id: app.id, status: app.status },
        data: { status: to },
      });
      if (count !== 1) throw new HttpError(409, 'Application status changed, please refresh', 'STALE_STATUS');
      await tx.applicationStatusHistory.create({
        data: { applicationId: app.id, fromStatus: app.status, toStatus: to, changedById: employerId },
      });
      await tx.notification.create({
        data: {
          userId: app.candidateId,
          applicationId: app.id,
          message: `Your application for "${app.job.title}" is now ${STATUS_LABEL[to]}`,
        },
      });
      return tx.application.findUniqueOrThrow({
        where: { id: app.id },
        select: { id: true, status: true, updatedAt: true, history: historyInclude },
      });
    });
    res.json({ application: { ...updated, allowedTransitions: TRANSITIONS[updated.status] } });
  }),
);

applicationsRouter.get(
  '/applications/:id/resume',
  requireRole('EMPLOYER'),
  wrap(async (req, res) => {
    const app = await loadForEmployer(req.params.id, req.user!.id);
    const file = resumePath(app.resumeFile);
    await fs.access(file).catch(() => {
      throw new HttpError(404, 'Resume file not found', 'RESUME_NOT_FOUND');
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="resume-${app.id}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(file, { dotfiles: 'deny' });
  }),
);

applicationsRouter.get(
  '/applications/:id/notes',
  requireRole('EMPLOYER'),
  wrap(async (req, res) => {
    await loadForEmployer(req.params.id, req.user!.id);
    const items = await prisma.employerNote.findMany({
      where: { applicationId: req.params.id, employerId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, body: true, createdAt: true },
    });
    res.json({ items });
  }),
);

applicationsRouter.post(
  '/applications/:id/notes',
  requireRole('EMPLOYER'),
  wrap(async (req, res) => {
    const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).parse(req.body);
    await loadForEmployer(req.params.id, req.user!.id);
    const note = await prisma.employerNote.create({
      data: { applicationId: req.params.id, employerId: req.user!.id, body },
      select: { id: true, body: true, createdAt: true },
    });
    res.status(201).json({ note });
  }),
);
