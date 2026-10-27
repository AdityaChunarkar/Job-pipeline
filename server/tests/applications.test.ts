import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { apply, createJob, resetDb, signup } from './helpers.js';

beforeEach(resetDb);

describe('applying to jobs', () => {
  it('lets a candidate apply successfully to an open job', async () => {
    const emp = await signup('EMPLOYER', 'e@x.com');
    const cand = await signup('CANDIDATE', 'c@x.com');
    const job = await createJob(emp.agent);

    const res = await apply(cand.agent, job.id);
    expect(res.status).toBe(201);
    expect(res.body.application.status).toBe('APPLIED');

    const history = await prisma.applicationStatusHistory.findMany();
    expect(history).toHaveLength(1);
    expect(history[0].toStatus).toBe('APPLIED');

    const mine = await cand.agent.get('/api/applications/mine');
    expect(mine.body.items).toHaveLength(1);
    // the employer is told about the new applicant
    expect(await prisma.notification.count({ where: { userId: emp.user.id } })).toBe(1);
  });

  it('rejects duplicate applications (backend check and DB unique constraint)', async () => {
    const emp = await signup('EMPLOYER', 'e@x.com');
    const cand = await signup('CANDIDATE', 'c@x.com');
    const job = await createJob(emp.agent);

    expect((await apply(cand.agent, job.id)).status).toBe(201);
    const dup = await apply(cand.agent, job.id);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ALREADY_APPLIED');
    expect(await prisma.application.count()).toBe(1);

    // the constraint itself holds even if the application layer is bypassed
    const existing = await prisma.application.findFirstOrThrow();
    await expect(
      prisma.application.create({
        data: { jobId: existing.jobId, candidateId: existing.candidateId, resumeFile: 'x.pdf', resumeOriginalName: 'x.pdf' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects applications to closed jobs, and accepts them again once reopened', async () => {
    const emp = await signup('EMPLOYER', 'e@x.com');
    const cand = await signup('CANDIDATE', 'c@x.com');
    const job = await createJob(emp.agent);

    expect((await emp.agent.post(`/api/employer/jobs/${job.id}/close`)).status).toBe(200);
    const res = await apply(cand.agent, job.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('JOB_CLOSED');
    expect(await prisma.application.count()).toBe(0);

    // closed jobs vanish from public search
    const list = await cand.agent.get('/api/jobs');
    expect(list.body.items).toHaveLength(0);

    await emp.agent.post(`/api/employer/jobs/${job.id}/reopen`);
    expect((await apply(cand.agent, job.id)).status).toBe(201);
  });

  it('does not let employers apply, or anonymous users apply', async () => {
    const emp = await signup('EMPLOYER', 'e@x.com');
    const job = await createJob(emp.agent);
    expect((await apply(emp.agent, job.id)).status).toBe(403);
    const anon = await signup('CANDIDATE', 'c@x.com');
    await anon.agent.post('/api/auth/logout');
    expect((await apply(anon.agent, job.id)).status).toBe(401);
  });

  it('filters and paginates public job listings', async () => {
    const emp = await signup('EMPLOYER', 'e@x.com');
    await createJob(emp.agent, { title: 'React Developer', location: 'Mumbai', type: 'FULL_TIME' });
    await createJob(emp.agent, { title: 'Data Intern', location: 'Pune', type: 'INTERNSHIP' });
    await createJob(emp.agent, { title: 'Designer', location: 'Mumbai', type: 'CONTRACT' });

    const cand = await signup('CANDIDATE', 'c@x.com');
    const q = await cand.agent.get('/api/jobs?q=react');
    expect(q.body.items.map((j: { title: string }) => j.title)).toEqual(['React Developer']);
    expect((await cand.agent.get('/api/jobs?location=mumbai')).body.total).toBe(2);
    expect((await cand.agent.get('/api/jobs?type=INTERNSHIP')).body.total).toBe(1);
    const page = await cand.agent.get('/api/jobs?pageSize=2&page=2');
    expect(page.body.items).toHaveLength(1);
    expect(page.body.totalPages).toBe(2);
  });
});
