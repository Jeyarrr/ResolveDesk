import { operationsRouter } from './operations.js';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { healthController } from '../controllers/health-controller.js';
import type { Database } from '../db/connection.js';
import type { Config } from '../config/env.js';
import { authService } from '../services/auth.js';
import { security, requireRole } from '../middleware/auth.js';
import { controllers } from '../controllers/api-controller.js';
import { collaborationController } from '../controllers/collaboration-controller.js';
import { loginInput } from '../validation/schemas.js';
import { profile } from '../repositories/users.js';
import { timingSafeEqual } from 'node:crypto';
import { AppError } from '../middleware/errors.js';
import { prepareUploads } from '../services/direct-upload.js';
import { runOperations, sharedLoginLimit, takeQuota } from '../services/runtime.js';
import { cleanupBlobs } from '../services/blob-storage.js';
import { z } from 'zod';
export function apiRouter(db: Database, config: Config) {
  const router = Router(),
    auth = authService(db, config),
    guard = security(auth, config),
    c = controllers(db);
  const collaboration = collaborationController(db, config);
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/health', healthController(db));
  const schedulerGuard = (authorization: string | undefined) => {
    const expected = `Bearer ${config.CRON_SECRET ?? ''}`;
    if (
      !config.CRON_SECRET ||
      !authorization ||
      Buffer.byteLength(authorization) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(authorization), Buffer.from(expected))
    )
      throw new AppError(401, 'Scheduler authorization required');
  };
  router.get('/operations/run', async (req, res) => {
    schedulerGuard(req.get('authorization'));
    await runOperations(db);
    res.json({ success: true, data: { completed: true } });
  });
  router.get('/operations/storage', async (req, res) => {
    schedulerGuard(req.get('authorization'));
    const cursor = z.string().max(2000).optional().parse(req.query.cursor);
    res.json({ success: true, data: await cleanupBlobs(db, config, cursor) });
  });
  router.get('/auth/csrf', guard.bootstrap);
  router.post(
    '/auth/login',
    config.SERVERLESS
      ? sharedLoginLimit(db, config)
      : rateLimit({
          windowMs: 15 * 60_000,
          limit: 20,
          standardHeaders: 'draft-8',
          legacyHeaders: false,
          message: {
            success: false,
            error: { message: 'Too many login attempts. Try again later.' },
          },
        }),
    guard.csrf,
    async (req, res) => {
      const input = loginInput.parse(req.body);
      const result = await auth.login(
        input.email,
        input.password,
        input.remember,
        typeof req.cookies?.[guard.sessionName] === 'string'
          ? req.cookies[guard.sessionName]
          : undefined,
      );
      res.cookie(guard.sessionName, result.token, {
        ...guard.options,
        ...(input.remember ? { expires: result.expiresAt } : {}),
      });
      res.clearCookie(guard.csrfName, guard.options);
      res.json({ success: true, data: { user: result.user, csrfToken: result.csrfToken } });
    },
  );
  router.use(guard.authenticate);
  router.use((req, res, next) =>
    ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? next() : guard.csrf(req, res, next),
  );
  router.get('/auth/me', async (req, res) =>
    res.json({
      success: true,
      data: { user: await profile(db, req.actor.id), csrfToken: auth.csrf(req.sessionToken) },
    }),
  );
  router.get('/runtime', (_req, res) =>
    res.json({
      success: true,
      data: {
        realtime: config.SERVERLESS ? 'polling' : 'websocket',
        directUpload: config.STORAGE_DRIVER === 'blob',
      },
    }),
  );
  router.get('/events/sync', async (req, res) => {
    if (!(await takeQuota(db, 'sync:' + req.actor.id, 60, 60)))
      throw new AppError(429, 'Please wait before refreshing again');
    await runOperations(db);
    res.json({ success: true, data: { refresh: true } });
  });
  router.post('/uploads/prepare', async (req, res) =>
    res.json({
      success: true,
      data: await prepareUploads(db, config, req.actor, req.body),
    }),
  );
  router.post('/auth/logout', async (req, res) => {
    await auth.logout(req.sessionToken);
    res.clearCookie(guard.sessionName, guard.options);
    res.json({ success: true, data: null });
  });
  router.get('/tickets', c.tickets);
  router.get('/attachment-limits', collaboration.limits);
  router.post('/tickets', collaboration.submit('ticket'));
  router.get('/tickets/:id', c.ticket);
  router.patch('/tickets/:id', c.patchTicket);
  router.patch('/tickets/:id/status', c.status);
  router.patch('/tickets/:id/resolve', c.resolve);
  router.patch('/tickets/:id/confirm-resolution', c.confirmResolution);
  router.patch('/tickets/:id/close', c.close);
  router.patch('/tickets/:id/reopen', c.reopen);
  router.patch('/tickets/:id/assign', requireRole('admin'), c.assign);
  router.get('/tickets/:id/comments', c.comments);
  router.get('/tickets/:id/conversation-state', c.conversationState);
  router.post('/tickets/:id/read', c.markRead);
  router.post('/tickets/:id/comments', collaboration.submit('comment'));
  router.get('/tickets/:id/attachments', collaboration.list);
  router.post('/tickets/:id/attachments', collaboration.submit('attachment'));
  router.get('/attachments/:id/download', collaboration.download);
  router.delete('/attachments/:id', collaboration.remove);
  router.get('/tickets/:id/activity', c.activity);
  router.get('/tickets/:id/escalations', requireRole('agent', 'admin'), c.ticketEscalations);
  router.post('/tickets/:id/escalations', requireRole('agent'), c.createEscalation);
  router.get('/escalations', requireRole('admin'), c.escalations);
  router.patch('/escalations/:id/acknowledge', requireRole('admin'), c.acknowledgeEscalation);
  router.patch('/escalations/:id/resolve', requireRole('admin'), c.resolveEscalation);
  router.get('/users', requireRole('admin'), c.users);
  router.get('/users/workloads', requireRole('admin'), c.workloads);
  router.post('/users', requireRole('admin'), c.createUser);
  router.get('/users/:id', requireRole('admin'), c.user);
  router.patch('/users/:id', requireRole('admin'), c.updateUser);
  for (const [path, kind] of [
    ['departments', 'departments'],
    ['ticket-categories', 'categories'],
  ] as const) {
    const ref = c.references(kind);
    router.get(`/${path}`, ref.list);
    router.post(`/${path}`, requireRole('admin'), ref.create);
    router.patch(`/${path}/:id`, requireRole('admin'), ref.update);
  }
  router.get('/analytics/dashboard', c.analytics);
  router.get('/response-templates', requireRole('agent', 'admin'), c.templates);
  router.post('/response-templates', requireRole('agent', 'admin'), c.createTemplate);
  router.patch('/response-templates/:id', requireRole('agent', 'admin'), c.updateTemplate);
  router.delete('/response-templates/:id', requireRole('agent', 'admin'), c.archiveTemplate);
  router.use(operationsRouter(db, config));
  return router;
}
