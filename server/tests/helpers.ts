import request from 'supertest';
import fs from 'node:fs/promises';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { config } from '../src/config.js';

export const app = createApp();

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Notification","EmployerNote","ApplicationStatusHistory","Application","Job","User" RESTART IDENTITY CASCADE',
  );
  await fs.rm(config.UPLOAD_DIR, { recursive: true, force: true });
}

export const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

export async function signup(role: 'EMPLOYER' | 'CANDIDATE', email: string) {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/register')
    .send({ name: `${role} ${email}`, email, password: 'password123', role, company: role === 'EMPLOYER' ? 'Acme' : undefined });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user: res.body.user as { id: string } };
}

export async function createJob(agent: request.Agent, overrides: Record<string, unknown> = {}) {
  const res = await agent.post('/api/employer/jobs').send({
    title: 'Backend Engineer',
    location: 'Remote',
    type: 'FULL_TIME',
    salaryMin: 100000,
    salaryMax: 150000,
    description: 'Build and maintain backend services for our product.',
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`createJob failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.job as { id: string };
}

export function apply(
  agent: request.Agent,
  jobId: string,
  file: { buffer: Buffer; filename: string; contentType: string } | null = {
    buffer: PDF,
    filename: 'cv.pdf',
    contentType: 'application/pdf',
  },
) {
  const req = agent.post(`/api/jobs/${jobId}/applications`).field('coverLetter', 'Hello');
  if (file) req.attach('resume', file.buffer, { filename: file.filename, contentType: file.contentType });
  return req;
}
