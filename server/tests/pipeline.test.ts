import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { apply, createJob, resetDb, signup } from './helpers.js';

beforeEach(resetDb);

async function setup() {
  const owner = await signup('EMPLOYER', 'owner@x.com');
  const cand = await signup('CANDIDATE', 'c@x.com');
  const job = await createJob(owner.agent);
  const appId = (await apply(cand.agent, job.id)).body.application.id as string;
  return { owner, cand, job, appId };
}

describe('hiring pipeline', () => {
  it('records history and notifies the candidate on each status change', async () => {
    const { owner, cand, appId } = await setup();

    for (const status of ['SHORTLISTED', 'INTERVIEW', 'HIRED']) {
      const res = await owner.agent.patch(`/api/applications/${appId}/status`).send({ status });
      expect(res.status).toBe(200);
      expect(res.body.application.status).toBe(status);
    }

    const history = await prisma.applicationStatusHistory.findMany({
      where: { applicationId: appId },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((h) => h.toStatus)).toEqual(['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'HIRED']);
    expect(history[2].fromStatus).toBe('SHORTLISTED');

    const notes = await cand.agent.get('/api/notifications');
    expect(notes.body.unread).toBe(3);
    expect(notes.body.items[0].message).toContain('Hired');

    await cand.agent.post('/api/notifications/read-all');
    expect((await cand.agent.get('/api/notifications')).body.unread).toBe(0);

    const detail = await cand.agent.get(`/api/applications/${appId}`);
    expect(detail.body.application.history).toHaveLength(4);
  });

  it('rejects invalid transitions with a clear error and changes nothing', async () => {
    const { owner, appId } = await setup();
    const skip = await owner.agent.patch(`/api/applications/${appId}/status`).send({ status: 'HIRED' });
    expect(skip.status).toBe(409);
    expect(skip.body.error.code).toBe('INVALID_TRANSITION');

    await owner.agent.patch(`/api/applications/${appId}/status`).send({ status: 'REJECTED' });
    const afterReject = await owner.agent.patch(`/api/applications/${appId}/status`).send({ status: 'SHORTLISTED' });
    expect(afterReject.status).toBe(409);

    expect((await owner.agent.patch(`/api/applications/${appId}/status`).send({ status: 'BOGUS' })).status).toBe(400);
    expect(await prisma.applicationStatusHistory.count()).toBe(2); // applied + rejected only
  });

  it('keeps employer notes private to the owning employer', async () => {
    const { owner, cand, appId } = await setup();
    const created = await owner.agent.post(`/api/applications/${appId}/notes`).send({ body: 'Strong portfolio' });
    expect(created.status).toBe(201);
    expect((await owner.agent.get(`/api/applications/${appId}/notes`)).body.items).toHaveLength(1);

    expect((await cand.agent.get(`/api/applications/${appId}/notes`)).status).toBe(403);
    const detail = await cand.agent.get(`/api/applications/${appId}`);
    expect(JSON.stringify(detail.body)).not.toContain('Strong portfolio');
  });
});

describe('auth', () => {
  it('hashes passwords, supports login/logout and rejects bad credentials', async () => {
    const { agent } = await signup('CANDIDATE', 'me@x.com');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'me@x.com' } });
    expect(user.passwordHash).not.toContain('password123');
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    await agent.post('/api/auth/logout');
    expect((await agent.get('/api/auth/me')).status).toBe(401);

    const bad = await agent.post('/api/auth/login').send({ email: 'me@x.com', password: 'wrongpassword' });
    expect(bad.status).toBe(401);
    const good = await agent.post('/api/auth/login').send({ email: 'me@x.com', password: 'password123' });
    expect(good.status).toBe(200);
    expect(good.headers['set-cookie'][0]).toContain('HttpOnly');
  });
});
