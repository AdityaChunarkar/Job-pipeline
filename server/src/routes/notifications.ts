import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, wrap } from '../errors.js';
import { requireAuth } from '../auth.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/',
  wrap(async (req, res) => {
    const { page, pageSize } = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse(req.query);
    const where = { userId: req.user!.id };
    const [total, unread, items] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, message: true, readAt: true, createdAt: true, applicationId: true },
      }),
    ]);
    res.json({ items, unread, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  }),
);

notificationsRouter.post(
  '/read-all',
  wrap(async (req, res) => {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.status(204).end();
  }),
);

notificationsRouter.post(
  '/:id/read',
  wrap(async (req, res) => {
    // Scoping by userId means other users' notifications simply do not match.
    const { count } = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (count === 0) {
      const exists = await prisma.notification.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
      if (!exists) throw new HttpError(404, 'Notification not found', 'NOT_FOUND');
    }
    res.status(204).end();
  }),
);
