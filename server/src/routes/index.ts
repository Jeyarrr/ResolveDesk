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
  router.get('/auth/csrf', guard.bootstrap);
  router.post(
    '/auth/login',
    rateLimit({
      windowMs: 15 * 60_000,
      limit: 20,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { success: false, error: { message: 'Too many login attempts. Try again later.' } },
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
  return router;
}
