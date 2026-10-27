import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { errorHandler, notFound } from './errors.js';
import { authRouter } from './routes/auth.js';
import { employerJobsRouter, jobsRouter } from './routes/jobs.js';
import { applicationsRouter } from './routes/applications.js';
import { notificationsRouter } from './routes/notifications.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet()); // API-only responses: default CSP is strict and appropriate
  app.use(cors({ origin: config.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/employer/jobs', employerJobsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api', applicationsRouter);
  app.use('/api', notFound);

  // Optional single-process deployment: serve the built SPA if it exists.
  const clientDist = path.resolve(process.cwd(), '../client/dist');
  if (config.NODE_ENV === 'production' && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
