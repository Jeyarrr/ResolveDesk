import { randomBytes } from 'node:crypto';
import type { CookieOptions, RequestHandler } from 'express';
import type { Actor } from '../db/schema.js';
import type { Config } from '../config/env.js';
import type { authService } from '../services/auth.js';
import { AppError } from './errors.js';
declare module 'express-serve-static-core' {
  interface Request {
    actor: Actor;
    sessionToken: string;
  }
}
export function security(auth: ReturnType<typeof authService>, config: Config) {
  const secure = config.NODE_ENV === 'production';
  const sessionName = secure ? '__Host-resolvedesk' : 'resolvedesk';
  const csrfName = secure ? '__Host-rd-csrf' : 'rd-csrf';
  const options: CookieOptions = {
    httpOnly: true,
    secure,
    sameSite: config.COOKIE_SAME_SITE,
    path: '/',
  };
  const authenticate: RequestHandler = async (req, _res, next) => {
    const token: unknown = req.cookies?.[sessionName];
    const row = await auth.authenticate(typeof token === 'string' ? token : undefined);
    req.actor = row.user;
    req.sessionToken = token as string;
    next();
  };
  const csrf: RequestHandler = (req, _res, next) => {
    if (req.get('origin') !== config.CLIENT_ORIGIN)
      throw new AppError(403, 'Request origin is not permitted');
    const session: unknown = req.cookies?.[sessionName];
    const preauth: unknown = req.cookies?.[csrfName];
    const token = req.get('x-csrf-token') ?? '';
    const source = req.path === '/auth/login' ? preauth : session;
    if (
      typeof source !== 'string' ||
      !/^[a-f0-9]{64}$/.test(source) ||
      !/^[a-f0-9]{64}$/.test(token) ||
      !auth.matches(auth.csrf(source), token)
    )
      throw new AppError(403, 'Security token expired. Refresh the page and try again.');
    const uploadRoute =
      req.method === 'POST' &&
      /^\/tickets(?:\/[0-9a-f-]+\/(?:attachments|comments))?$/i.test(req.path);
    if (!req.is('application/json') && !(uploadRoute && req.is('multipart/form-data')))
      throw new AppError(415, 'Use application/json or a supported multipart upload route');
    next();
  };
  const bootstrap: RequestHandler = (_req, res) => {
    const token = randomBytes(32).toString('hex');
    res.cookie(csrfName, token, { ...options, maxAge: 3600_000 });
    res.json({ success: true, data: { csrfToken: auth.csrf(token) } });
  };
  return { authenticate, csrf, bootstrap, sessionName, csrfName, options };
}
export const requireRole =
  (...roles: Actor['role'][]): RequestHandler =>
  (req, _res, next) => {
    if (!roles.includes(req.actor.role))
      throw new AppError(403, 'You do not have permission for this action');
    next();
  };
