import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import { prisma } from '../src/db.js';
import { config } from '../src/config.js';
import request from 'supertest';
import { PDF, app, apply, createJob, resetDb, signup } from './helpers.js';

beforeEach(resetDb);

async function setup() {
  const owner = await signup('EMPLOYER', 'owner@x.com');
  const other = await signup('EMPLOYER', 'other@x.com');
  const cand = await signup('CANDIDATE', 'c@x.com');
  const job = await createJob(owner.agent);
  const applied = await apply(cand.agent, job.id);
  return { owner, other, cand, job, appId: applied.body.application.id as string };
}

describe('resume access control', () => {
  it('lets only the employer who owns the job download the resume', async () => {
    const { owner, appId } = await setup();
    const res = await owner.agent.get(`/api/applications/${appId}/resume`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['cache-control']).toContain('no-store');
    expect(Buffer.from(res.body).equals(PDF)).toBe(true);
  });

  it('denies other employers, candidates (including the applicant) and anonymous users', async () => {
    const { other, cand, appId } = await setup();
    const url = `/api/applications/${appId}/resume`;

    const asOther = await other.agent.get(url);
    expect(asOther.status).toBe(403);
    expect(asOther.body.error.code).toBe('FORBIDDEN');

    expect((await cand.agent.get(url)).status).toBe(403);

    await other.agent.post('/api/auth/logout');
    expect((await other.agent.get(url)).status).toBe(401);
  });

  it('returns a clear 404 for unknown applications and missing files', async () => {
    const { owner, appId } = await setup();
    expect((await owner.agent.get('/api/applications/does-not-exist/resume')).status).toBe(404);

    const app = await prisma.application.findUniqueOrThrow({ where: { id: appId } });
    await fs.rm(`${config.UPLOAD_DIR}/${app.resumeFile}`);
    const res = await owner.agent.get(`/api/applications/${appId}/resume`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESUME_NOT_FOUND');
  });

  it('refuses a tampered stored filename (path traversal)', async () => {
    const { owner, appId } = await setup();
    await prisma.application.update({ where: { id: appId }, data: { resumeFile: '../../etc/passwd' } });
    const res = await owner.agent.get(`/api/applications/${appId}/resume`);
    expect(res.status).toBe(404);
  });

  it('stores resumes under a server-generated name, ignoring the client filename', async () => {
    const owner = await signup('EMPLOYER', 'o@x.com');
    const cand = await signup('CANDIDATE', 'c@x.com');
    const job = await createJob(owner.agent);
    const res = await apply(cand.agent, job.id, { buffer: PDF, filename: '../../evil name.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    const app = await prisma.application.findFirstOrThrow();
    expect(app.resumeFile).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect((await fs.readdir(config.UPLOAD_DIR))).toEqual([app.resumeFile]);
  });
});

describe('invalid uploads', () => {
  it.each([
    ['wrong extension', { buffer: PDF, filename: 'cv.exe', contentType: 'application/pdf' }],
    ['wrong MIME type', { buffer: PDF, filename: 'cv.pdf', contentType: 'text/plain' }],
    ['PDF extension and MIME but not a PDF signature', { buffer: Buffer.from('MZ not a pdf at all'), filename: 'cv.pdf', contentType: 'application/pdf' }],
  ])('rejects %s', async (_name, file) => {
    const owner = await signup('EMPLOYER', 'o@x.com');
    const cand = await signup('CANDIDATE', 'c@x.com');
    const job = await createJob(owner.agent);
    const res = await apply(cand.agent, job.id, file);
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    expect(await prisma.application.count()).toBe(0);
  });

  it('rejects a missing resume', async () => {
    const owner = await signup('EMPLOYER', 'o@x.com');
    const cand = await signup('CANDIDATE', 'c@x.com');
    const job = await createJob(owner.agent);
    const res = await apply(cand.agent, job.id, null);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RESUME_REQUIRED');
  });

  it('rejects an oversized file and stores nothing', async () => {
    const owner = await signup('EMPLOYER', 'o@x.com');
    const cand = await signup('CANDIDATE', 'c@x.com');
    const job = await createJob(owner.agent);
    const big = Buffer.concat([PDF, Buffer.alloc(config.MAX_UPLOAD_BYTES + 1, 'a')]);
    const res = await apply(cand.agent, job.id, { buffer: big, filename: 'big.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    expect(await prisma.application.count()).toBe(0);
    await expect(fs.readdir(config.UPLOAD_DIR)).rejects.toThrow(); // directory never even created
  });
});

describe('employer ownership', () => {
  it('prevents an employer from modifying another employer\'s job', async () => {
    const { other, job } = await setup();
    const body = {
      title: 'Hijacked', location: 'Nowhere', type: 'FULL_TIME',
      description: 'This update should never be applied to the job.',
    };
    expect((await other.agent.put(`/api/employer/jobs/${job.id}`).send(body)).status).toBe(403);
    expect((await other.agent.post(`/api/employer/jobs/${job.id}/close`)).status).toBe(403);
    expect((await other.agent.get(`/api/employer/jobs/${job.id}/applications`)).status).toBe(403);
    const unchanged = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(unchanged.title).toBe('Backend Engineer');
    expect(unchanged.status).toBe('OPEN');
  });

  it('prevents another employer from changing status, reading or writing notes', async () => {
    const { other, appId } = await setup();
    expect((await other.agent.patch(`/api/applications/${appId}/status`).send({ status: 'SHORTLISTED' })).status).toBe(403);
    expect((await other.agent.get(`/api/applications/${appId}/notes`)).status).toBe(403);
    expect((await other.agent.post(`/api/applications/${appId}/notes`).send({ body: 'x' })).status).toBe(403);
    expect((await other.agent.get(`/api/applications/${appId}`)).status).toBe(403);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: appId } })).status).toBe('APPLIED');
  });

  it('prevents a candidate from viewing another candidate\'s application or using employer routes', async () => {
    const { appId } = await setup();
    const stranger = await signup('CANDIDATE', 'stranger@x.com');
    expect((await stranger.agent.get(`/api/applications/${appId}`)).status).toBe(403);
    expect((await stranger.agent.patch(`/api/applications/${appId}/status`).send({ status: 'HIRED' })).status).toBe(403);
    expect((await stranger.agent.get('/api/employer/jobs')).status).toBe(403);
  });

  it('ignores a client-supplied role or user id', async () => {
    const cand = await signup('CANDIDATE', 'sneaky@x.com');
    const admin = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Eve', email: 'eve@x.com', password: 'password123', role: 'ADMIN' });
    expect(admin.status).toBe(400);
    // a forged header/body cannot turn a candidate into an employer
    const attempt = await cand.agent.post('/api/employer/jobs').set('X-User-Role', 'EMPLOYER').send({ role: 'EMPLOYER' });
    expect(attempt.status).toBe(403);
  });
});
