import type { RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { config } from './config.js';
import { prisma } from './db.js';
import { HttpError } from './errors.js';

export const COOKIE_NAME = 'jp_session';

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
  name: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function setSessionCookie(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.NODE_ENV === 'production',
    maxAge: 7 * 24 * 3600 * 1000,
    path: '/',
  });
}

export const clearSessionCookie = (res: Response) => res.clearCookie(COOKIE_NAME, { path: '/' });

/** Loads the user from the DB on every request, so the role is never taken from the token or client. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) throw new HttpError(401, 'Authentication required', 'UNAUTHENTICATED');
    let sub: string;
    try {
      sub = (jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload).sub as string;
    } catch {
      throw new HttpError(401, 'Session is invalid or expired', 'UNAUTHENTICATED');
    }
    const user = await prisma.user.findUnique({
      where: { id: sub },
      select: { id: true, role: true, email: true, name: true },
    });
    if (!user) throw new HttpError(401, 'Account no longer exists', 'UNAUTHENTICATED');
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
};

export const requireRole =
  (role: Role): RequestHandler =>
  (req, _res, next) =>
    req.user?.role === role
      ? next()
      : next(new HttpError(403, `This action requires the ${role.toLowerCase()} role`, 'FORBIDDEN'));
