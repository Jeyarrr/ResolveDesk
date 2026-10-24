import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../db/connection.js';
import { notificationService } from '../services/notifications.js';
import { slaService } from '../services/sla.js';
import { reports } from '../services/reports.js';
import { requireRole } from '../middleware/auth.js';
export function operationsRouter(db: Database) {
  const router = Router(),
    n = notificationService(db),
    sla = slaService(db);
  router.get('/notifications', async (req, res) =>
    res.json({ success: true, data: await n.list(req.actor, req.query) }),
  );
  router.get('/notifications/unread-count', async (req, res) =>
    res.json({ success: true, data: await n.count(req.actor) }),
  );
  router.get('/notifications/preferences', async (req, res) =>
    res.json({ success: true, data: await n.preferences(req.actor) }),
  );
  router.patch('/notifications/preferences', async (req, res) =>
    res.json({ success: true, data: await n.savePreferences(req.actor, req.body) }),
  );
  router.patch('/notifications/read-all', async (req, res) => {
    z.object({}).strict().parse(req.body);
    res.json({ success: true, data: await n.read(req.actor, null) });
  });
  router.patch('/notifications/:id/read', async (req, res) => {
    z.object({}).strict().parse(req.body);
    res.json({ success: true, data: await n.read(req.actor, z.uuid().parse(req.params.id)) });
  });
  router.get('/tickets/:id/sla', async (req, res) =>
    res.json({ success: true, data: await sla.ticket(req.actor, z.uuid().parse(req.params.id)) }),
  );
  router.get('/sla/overview', async (req, res) =>
    res.json({ success: true, data: await sla.overview(req.actor) }),
  );
  router.get('/sla/policies', requireRole('admin'), async (_req, res) =>
    res.json({ success: true, data: await sla.policies() }),
  );
  router.patch('/sla/policies/:id', requireRole('admin'), async (req, res) =>
    res.json({
      success: true,
      data: await sla.update(req.actor, z.uuid().parse(req.params.id), req.body),
    }),
  );
  router.get('/analytics/overview', requireRole('admin'), async (req, res) =>
    res.json({ success: true, data: (await reports(db, req.actor, req.query)).data }),
  );
  router.get('/reports/export', requireRole('admin'), async (req, res) => {
    const report = await reports(db, req.actor, req.query);
    res.attachment(report.filename).type('text/csv').send(report.csv());
  });
  return router;
}
