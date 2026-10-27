import { Router } from 'express';
import type { RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, wrap } from '../errors.js';
import { COOKIE_NAME, requireAuth, requireRole } from '../auth.js';

export const jobsRouter = Router(); // public / candidate-facing
export const employerJobsRouter = Router(); // employer-only

const JOB_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'REMOTE'] as const;

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

const jobBody = z
  .object({
    title: z.string().trim().min(3).max(120),
    location: z.string().trim().min(2).max(120),
    type: z.enum(JOB_TYPES),
    salaryMin: z.number().int().min(0).max(10_000_000).nullable().optional(),
    salaryMax: z.number().int().min(0).max(10_000_000).nullable().optional(),
    description: z.string().trim().min(20, 'Description must be at least 20 characters').max(10_000),
  })
  .refine((j) => j.salaryMin == null || j.salaryMax == null || j.salaryMin <= j.salaryMax, {
    message: 'Minimum salary cannot exceed maximum salary',
    path: ['salaryMax'],
  });

const employerSelect = { select: { name: true, company: true } } as const;

/** Attaches req.user when a valid session exists but never rejects anonymous visitors. */
const optionalAuth: RequestHandler = (req, res, next) =>
  req.cookies?.[COOKIE_NAME] ? requireAuth(req, res, next) : next();

export async function loadOwnedJob(jobId: string, employerId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new HttpError(404, 'Job not found', 'JOB_NOT_FOUND');
  if (job.employerId !== employerId) throw new HttpError(403, 'You do not own this job', 'FORBIDDEN');
  return job;
}

// ---- Public browsing ----------------------------------------------------

jobsRouter.get(
  '/',
  wrap(async (req, res) => {
    const { page, pageSize } = pageSchema.parse(req.query);
    const q = z.string().trim().max(100).optional().parse(req.query.q);
    const location = z.string().trim().max(100).optional().parse(req.query.location);
    const type = z.enum(JOB_TYPES).optional().parse(req.query.type || undefined);

    const where: Prisma.JobWhereInput = {
      status: 'OPEN',
      ...(type && { type }),
      ...(location && { location: { contains: location, mode: 'insensitive' } }),
      ...(q && {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { employer: { company: { contains: q, mode: 'insensitive' } } },
        ],
      }),
    };
    const [total, items] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { employer: employerSelect },
      }),
    ]);
    res.json({ items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  }),
);

jobsRouter.get(
  '/locations',
  wrap(async (_req, res) => {
    const rows = await prisma.job.findMany({
      where: { status: 'OPEN' },
      distinct: ['location'],
      select: { location: true },
      orderBy: { location: 'asc' },
    });
    res.json({ items: rows.map((r) => r.location) });
  }),
);

jobsRouter.get(
  '/:id',
  optionalAuth,
  wrap(async (req, res) => {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: { employer: employerSelect },
    });
    // Closed jobs are only visible to the owning employer.
    if (!job || (job.status === 'CLOSED' && job.employerId !== req.user?.id)) {
      throw new HttpError(404, 'Job not found', 'JOB_NOT_FOUND');
    }
    let myApplication = null;
    if (req.user?.role === 'CANDIDATE') {
      myApplication = await prisma.application.findUnique({
        where: { jobId_candidateId: { jobId: job.id, candidateId: req.user.id } },
        select: { id: true, status: true },
      });
    }
    res.json({ job, myApplication });
  }),
);

// ---- Employer management ------------------------------------------------

employerJobsRouter.use(requireAuth, requireRole('EMPLOYER'));

employerJobsRouter.get(
  '/',
  wrap(async (req, res) => {
    const { page, pageSize } = pageSchema.parse(req.query);
    const where = { employerId: req.user!.id };
    const [total, jobs] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { applications: true } } },
      }),
    ]);
    const items = jobs.map(({ _count, ...j }) => ({ ...j, applicantCount: _count.applications }));
    res.json({ items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  }),
);

employerJobsRouter.post(
  '/',
  wrap(async (req, res) => {
    const body = jobBody.parse(req.body);
    const job = await prisma.job.create({
      data: { ...body, salaryMin: body.salaryMin ?? null, salaryMax: body.salaryMax ?? null, employerId: req.user!.id },
    });
    res.status(201).json({ job });
  }),
);

employerJobsRouter.get(
  '/:id',
  wrap(async (req, res) => {
    res.json({ job: await loadOwnedJob(req.params.id, req.user!.id) });
  }),
);

employerJobsRouter.put(
  '/:id',
  wrap(async (req, res) => {
    await loadOwnedJob(req.params.id, req.user!.id);
    const body = jobBody.parse(req.body);
    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: { ...body, salaryMin: body.salaryMin ?? null, salaryMax: body.salaryMax ?? null },
    });
    res.json({ job });
  }),
);

for (const [action, status] of [['close', 'CLOSED'], ['reopen', 'OPEN']] as const) {
  employerJobsRouter.post(
    `/:id/${action}`,
    wrap(async (req, res) => {
      await loadOwnedJob(req.params.id, req.user!.id);
      const job = await prisma.job.update({ where: { id: req.params.id }, data: { status } });
      res.json({ job });
    }),
  );
}

employerJobsRouter.get(
  '/:id/applications',
  wrap(async (req, res) => {
    await loadOwnedJob(req.params.id, req.user!.id);
    const { page, pageSize } = pageSchema.parse(req.query);
    const status = z
      .enum(['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'HIRED', 'REJECTED'])
      .optional()
      .parse(req.query.status || undefined);
    const where = { jobId: req.params.id, ...(status && { status }) };
    const [total, items] = await Promise.all([
      prisma.application.count({ where }),
      prisma.application.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          status: true,
          coverLetter: true,
          resumeOriginalName: true,
          createdAt: true,
          updatedAt: true,
          candidate: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);
    res.json({ items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  }),
);
