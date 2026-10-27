import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db.js';
import { HttpError, wrap } from '../errors.js';
import { clearSessionCookie, requireAuth, setSessionCookie } from '../auth.js';
import { config } from '../config.js';

export const authRouter = Router();

const BCRYPT_ROUNDS = config.NODE_ENV === 'test' ? 4 : 12;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.NODE_ENV === 'test',
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
});

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  // Only these two values are accepted; there is no way to self-register as anything else.
  role: z.enum(['EMPLOYER', 'CANDIDATE']),
  company: z.string().trim().min(1).max(120).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

const publicUser = { id: true, email: true, name: true, role: true, company: true } as const;

authRouter.post(
  '/register',
  limiter,
  wrap(async (req, res) => {
    const body = registerSchema.parse(req.body);
    if (body.role === 'EMPLOYER' && !body.company) {
      throw new HttpError(400, 'Company name is required for employers', 'VALIDATION_ERROR');
    }
    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) throw new HttpError(409, 'An account with this email already exists', 'EMAIL_TAKEN');
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        role: body.role,
        company: body.role === 'EMPLOYER' ? body.company : null,
        passwordHash: await bcrypt.hash(body.password, BCRYPT_ROUNDS),
      },
      select: publicUser,
    });
    setSessionCookie(res, user.id);
    res.status(201).json({ user });
  }),
);

// Precomputed so unknown emails cost the same as wrong passwords (limits user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

authRouter.post(
  '/login',
  limiter,
  wrap(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    setSessionCookie(res, user.id);
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, company: user.company },
    });
  }),
);

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: publicUser });
    res.json({ user });
  }),
);
