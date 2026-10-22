import type { RequestHandler } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import { tickets, users } from '../db/schema.js';
import * as input from '../validation/schemas.js';
import { ticketService } from '../services/tickets.js';
import { escalationService } from '../services/escalations.js';
import { agentWorkloads } from '../services/workloads.js';
import { conversationService } from '../services/conversations.js';
import { lifecycleService, lifecycleActions } from '../services/lifecycle.js';
import { adminService } from '../services/admin.js';
import { analytics } from '../services/analytics.js';
import { profile } from '../repositories/users.js';
import {
  listTickets,
  scope,
  ticketActivity,
  ticketComments,
  ticketRows,
} from '../repositories/tickets.js';
import { AppError } from '../middleware/errors.js';
export function controllers(db: Database) {
  const service = ticketService(db),
    conversation = conversationService(db),
    escalation = escalationService(db),
    admin = adminService(db),
    lifecycle = lifecycleService(db);
  const wrap =
    (fn: (req: Parameters<RequestHandler>[0]) => Promise<unknown>, status = 200): RequestHandler =>
    async (req, res) => {
      res.status(status).json({ success: true, data: await fn(req) });
    };
  const id = (req: Parameters<RequestHandler>[0]) => input.uuid.parse(req.params.id);
  return {
    conversationState: wrap((req) => conversation.state(req.actor, id(req))),
    markRead: wrap((req) => conversation.read(req.actor, id(req), req.body)),
    templates: wrap((req) => conversation.templates(req.actor, req.query)),
    createTemplate: wrap((req) => conversation.saveTemplate(req.actor, null, req.body), 201),
    updateTemplate: wrap((req) => conversation.saveTemplate(req.actor, id(req), req.body)),
    archiveTemplate: wrap((req) => conversation.saveTemplate(req.actor, id(req), req.body, true)),
    workloads: wrap((req) =>
      agentWorkloads(db, req.actor, input.pagination.strict().parse(req.query)),
    ),
    escalations: wrap((req) => escalation.list(req.actor, input.escalationQuery.parse(req.query))),
    ticketEscalations: wrap((req) =>
      escalation.list(req.actor, input.escalationQuery.parse(req.query), id(req)),
    ),
    createEscalation: wrap((req) => escalation.create(req.actor, id(req), req.body), 201),
    acknowledgeEscalation: wrap((req) =>
      escalation.change(req.actor, id(req), 'acknowledge', req.body),
    ),
    resolveEscalation: wrap((req) => escalation.change(req.actor, id(req), 'resolve', req.body)),
    tickets: wrap((req) => listTickets(db, req.actor, input.ticketQuery.parse(req.query))),
    ticket: wrap(async (req) => {
      const [row] = await ticketRows(db, and(eq(tickets.id, id(req)), scope(req.actor)));
      if (!row) throw new AppError(404, 'Ticket not found');
      return { ...row, lifecycleActions: lifecycleActions(req.actor, row) };
    }),
    createTicket: wrap((req) => service.create(req.actor, input.ticketInput.parse(req.body)), 201),
    patchTicket: wrap((req) =>
      service.patch(req.actor, id(req), input.ticketPatch.parse(req.body)),
    ),
    status: wrap((req) => lifecycle.status(req.actor, id(req), req.body)),
    resolve: wrap((req) => lifecycle.resolve(req.actor, id(req), req.body)),
    confirmResolution: wrap((req) => lifecycle.confirm(req.actor, id(req), req.body)),
    close: wrap((req) => lifecycle.close(req.actor, id(req), req.body)),
    reopen: wrap((req) => lifecycle.reopen(req.actor, id(req), req.body)),
    assign: wrap((req) => {
      const data = input.assignmentInput.parse(req.body);
      return service.assign(req.actor, id(req), data.assignedAgentId, data);
    }),
    comments: wrap((req) => ticketComments(db, req.actor, id(req))),
    comment: wrap(
      (req) => service.comment(req.actor, id(req), input.commentInput.parse(req.body)),
      201,
    ),
    activity: wrap((req) => ticketActivity(db, req.actor, id(req))),
    users: wrap((req) => admin.list(input.userQuery.parse(req.query))),
    user: wrap(async (req) => {
      const [row] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, id(req)));
      if (!row) throw new AppError(404, 'User not found');
      return profile(db, row.id);
    }),
    createUser: wrap((req) => admin.create(input.userInput.parse(req.body)), 201),
    updateUser: wrap((req) => admin.update(id(req), input.userPatch.parse(req.body))),
    references: (kind: 'departments' | 'categories') => ({
      list: wrap((req) => admin.references(kind, req.actor.role === 'admin')),
      create: wrap((req) => admin.referenceCreate(kind, input.referenceInput.parse(req.body)), 201),
      update: wrap((req) =>
        admin.referenceUpdate(kind, id(req), input.referencePatch.parse(req.body)),
      ),
    }),
    analytics: wrap((req) => {
      const q = z
        .object({
          days: z.coerce.number().int().min(1).max(90).default(14),
          period: z.enum(['true', 'false']).default('false'),
        })
        .strict()
        .parse(req.query);
      return analytics(db, req.actor, q.days, q.period === 'true');
    }),
  };
}
