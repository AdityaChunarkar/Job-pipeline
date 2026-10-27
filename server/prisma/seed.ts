// Idempotent demo data. Safe to run repeatedly: every record is looked up before it is created.
// Development-only credentials; never use these anywhere real.
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import type { ApplicationStatus, JobType } from '@prisma/client';
import { prisma } from '../src/db.js';
import { config } from '../src/config.js';

const DEMO_PASSWORD = 'DemoPass123!';

const dummyPdf = (label: string) =>
  Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
      `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n` +
      `4 0 obj<</Length 60>>stream\nBT /F1 14 Tf 20 50 Td (Demo resume: ${label}) Tj ET\nendstream endobj\n` +
      `5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  );

async function user(email: string, name: string, role: 'EMPLOYER' | 'CANDIDATE', company?: string) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role, company, passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12) },
  });
}

const JOBS: {
  title: string; location: string; type: JobType; salaryMin: number; salaryMax: number;
  description: string; status?: 'OPEN' | 'CLOSED';
}[] = [
  { title: 'Senior Frontend Engineer', location: 'Bengaluru, India', type: 'FULL_TIME', salaryMin: 2400000, salaryMax: 3600000,
    description: 'Own the web experience of our hiring platform. You will work with React, TypeScript and a strong design system, and mentor other engineers.' },
  { title: 'Backend Engineer (Node.js)', location: 'Remote', type: 'REMOTE', salaryMin: 2000000, salaryMax: 3000000,
    description: 'Design and ship reliable APIs backed by PostgreSQL. You care about testing, observability and clean data models.' },
  { title: 'Product Design Intern', location: 'Mumbai, India', type: 'INTERNSHIP', salaryMin: 300000, salaryMax: 420000,
    description: 'Join the design team for six months. You will create flows, prototypes and polished UI under close mentorship.' },
  { title: 'Data Analyst (Contract)', location: 'Pune, India', type: 'CONTRACT', salaryMin: 1200000, salaryMax: 1800000,
    description: 'A six-month contract analysing funnel and retention data, building dashboards, and presenting insights to leadership.' },
  { title: 'Customer Success Associate', location: 'Mumbai, India', type: 'PART_TIME', salaryMin: 600000, salaryMax: 900000,
    description: 'Help customers get value from the product. Part-time, flexible hours, ideal alongside studies.' },
  { title: 'QA Engineer', location: 'Bengaluru, India', type: 'FULL_TIME', salaryMin: 1400000, salaryMax: 2000000, status: 'CLOSED',
    description: 'This role has been filled. Kept in the demo data to show how closed jobs behave.' },
];

// [job title, candidate email, final status]
const APPLICATIONS: [string, string, ApplicationStatus][] = [
  ['Senior Frontend Engineer', 'candidate@demo.test', 'INTERVIEW'],
  ['Senior Frontend Engineer', 'priya@demo.test', 'SHORTLISTED'],
  ['Senior Frontend Engineer', 'rahul@demo.test', 'REJECTED'],
  ['Backend Engineer (Node.js)', 'candidate@demo.test', 'APPLIED'],
  ['Backend Engineer (Node.js)', 'priya@demo.test', 'HIRED'],
  ['Product Design Intern', 'candidate@demo.test', 'SHORTLISTED'],
  ['Data Analyst (Contract)', 'rahul@demo.test', 'APPLIED'],
];
const ORDER: ApplicationStatus[] = ['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'HIRED'];

async function main() {
  const employer = await user('employer@demo.test', 'Elena Employer', 'EMPLOYER', 'Northwind Labs');
  const candidates = {
    'candidate@demo.test': await user('candidate@demo.test', 'Casey Candidate', 'CANDIDATE'),
    'priya@demo.test': await user('priya@demo.test', 'Priya Sharma', 'CANDIDATE'),
    'rahul@demo.test': await user('rahul@demo.test', 'Rahul Verma', 'CANDIDATE'),
  } as const;

  const jobs = new Map<string, string>();
  for (const j of JOBS) {
    const existing = await prisma.job.findFirst({ where: { employerId: employer.id, title: j.title } });
    const job = existing ?? (await prisma.job.create({ data: { ...j, status: j.status ?? 'OPEN', employerId: employer.id } }));
    jobs.set(j.title, job.id);
  }

  await fs.mkdir(config.UPLOAD_DIR, { recursive: true });
  let created = 0;
  for (const [i, [title, email, finalStatus]] of APPLICATIONS.entries()) {
    const jobId = jobs.get(title)!;
    const candidate = candidates[email as keyof typeof candidates];
    const exists = await prisma.application.findUnique({ where: { jobId_candidateId: { jobId, candidateId: candidate.id } } });
    // Deterministic, UUID-shaped names so re-seeding never piles up files.
    const resumeFile = exists?.resumeFile ?? `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}.pdf`;
    // Written even for existing applications, so a wiped storage directory is restored on re-seed.
    await fs.writeFile(path.join(config.UPLOAD_DIR, resumeFile), dummyPdf(candidate.name), { mode: 0o600 });
    if (exists) continue;

    const path_: ApplicationStatus[] = finalStatus === 'REJECTED' ? ['APPLIED', 'SHORTLISTED', 'REJECTED'] : ORDER.slice(0, ORDER.indexOf(finalStatus) + 1);
    const start = Date.now() - (path_.length + 2) * 24 * 3600 * 1000;

    await prisma.$transaction(async (tx) => {
      const app = await tx.application.create({
        data: {
          jobId, candidateId: candidate.id, status: finalStatus,
          coverLetter: `Hi, I'm ${candidate.name} and I'd love to join the team.`,
          resumeFile, resumeOriginalName: `${candidate.name.replace(/ /g, '_')}_Resume.pdf`,
          createdAt: new Date(start),
        },
      });
      for (const [k, status] of path_.entries()) {
        const at = new Date(start + k * 24 * 3600 * 1000);
        await tx.applicationStatusHistory.create({
          data: { applicationId: app.id, fromStatus: k === 0 ? null : path_[k - 1], toStatus: status, changedById: k === 0 ? candidate.id : employer.id, createdAt: at },
        });
        if (k > 0) {
          await tx.notification.create({
            data: { userId: candidate.id, applicationId: app.id, message: `Your application for "${title}" is now ${status[0] + status.slice(1).toLowerCase()}`, createdAt: at, readAt: k === 1 ? at : null },
          });
        }
      }
      await tx.notification.create({
        data: { userId: employer.id, applicationId: app.id, message: `${candidate.name} applied to "${title}"`, createdAt: new Date(start) },
      });
      if (finalStatus === 'INTERVIEW' || finalStatus === 'HIRED') {
        await tx.employerNote.create({ data: { applicationId: app.id, employerId: employer.id, body: 'Strong portfolio and clear communication.' } });
      }
    });
    created++;
  }
  console.log(`Seed complete: ${created} new application(s), ${JOBS.length} jobs ensured.`);
}

main().finally(() => prisma.$disconnect());
