import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import type { Database } from '../db/connection.js';
import { activity, escalations, tickets, users, type Actor } from '../db/schema.js';
import { AppError } from '../middleware/errors.js';
import { permittedTicket, scope } from '../repositories/tickets.js';
import {
  escalationActionInput,
  escalationInput,
  type escalationQuery,
} from '../validation/schemas.js';

export function escalationService(db: Database) {
  return {
    async list(actor: Actor, q: z.infer<typeof escalationQuery>, ticketId?: string) {
      if (actor.role === 'employee' || (!ticketId && actor.role !== 'admin'))
        throw new AppError(403, 'Escalations are restricted to authorized support staff');
      if (ticketId) await permittedTicket(db, actor, ticketId);
      const assignee = alias(users, 'escalation_assignee');
      const requester = alias(users, 'escalation_requester');
      const acknowledger = alias(users, 'escalation_acknowledger');
      const resolver = alias(users, 'escalation_resolver');
      const search = q.search.replace(/[\\%_]/g, '\\$&');
      const where = and(
        scope(actor),
        ticketId ? eq(tickets.id, ticketId) : undefined,
        q.state === 'active'
          ? inArray(escalations.status, ['open', 'acknowledged'])
          : q.state === 'resolved'
            ? eq(escalations.status, 'resolved')
            : undefined,
        search
          ? or(
              ilike(tickets.subject, `%${search}%`),
              sql`('RD-' || ${tickets.ticketNumber}::text) ilike ${`%${search}%`}`,
            )
          : undefined,
      );
      const [items, totals] = await Promise.all([
        db
          .select({
            id: escalations.id,
            ticketId: tickets.id,
            ticketNumber: tickets.ticketNumber,
            subject: tickets.subject,
            priority: tickets.priority,
            ticketStatus: tickets.status,
            assigneeName: assignee.fullName,
            requestedBy: escalations.requestedBy,
            requestedByName: requester.fullName,
            reason: escalations.reason,
            status: escalations.status,
            createdAt: escalations.createdAt,
            acknowledgedAt: escalations.acknowledgedAt,
            acknowledgedByName: acknowledger.fullName,
            resolvedAt: escalations.resolvedAt,
            resolvedByName: resolver.fullName,
          })
          .from(escalations)
          .innerJoin(tickets, eq(tickets.id, escalations.ticketId))
          .innerJoin(requester, eq(requester.id, escalations.requestedBy))
          .leftJoin(assignee, eq(assignee.id, tickets.assignedAgentId))
          .leftJoin(acknowledger, eq(acknowledger.id, escalations.acknowledgedBy))
          .leftJoin(resolver, eq(resolver.id, escalations.resolvedBy))
          .where(where)
          .orderBy(desc(escalations.createdAt), desc(escalations.id))
          .limit(q.limit)
          .offset((q.page - 1) * q.limit),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(escalations)
          .innerJoin(tickets, eq(tickets.id, escalations.ticketId))
          .where(where),
      ]);
      return { items, total: totals[0]?.count ?? 0, page: q.page, limit: q.limit };
    },
    async create(actor: Actor, ticketId: string, body: unknown) {
      if (actor.role !== 'agent')
        throw new AppError(403, 'Only the assigned agent can request escalation');
      const input = escalationInput.parse(body);
      return db.transaction(async (tx) => {
        const ticket = await permittedTicket(tx, actor, ticketId, true);
        if (['resolved', 'closed'].includes(ticket.status))
          throw new AppError(409, 'Reopen this ticket before requesting escalation.');
        const [active] = await tx
          .select({ id: escalations.id })
          .from(escalations)
          .where(
            and(
              eq(escalations.ticketId, ticketId),
              inArray(escalations.status, ['open', 'acknowledged']),
            ),
          );
        if (active) throw new AppError(409, 'This ticket already has an active escalation.');
        const [saved] = await tx
          .insert(escalations)
          .values({ ticketId, requestedBy: actor.id, reason: input.reason })
          .returning();
        await tx.insert(activity).values({
          ticketId,
          actorId: actor.id,
          action: 'Escalation requested',
          newValue: 'open',
          explanation: input.reason,
          isInternal: true,
        });
        return saved!;
      });
    },
    async change(actor: Actor, id: string, action: 'acknowledge' | 'resolve', body: unknown) {
      if (actor.role !== 'admin')
        throw new AppError(403, 'Only administrators can manage escalations');
      const input = escalationActionInput.parse(body);
      return db.transaction(async (tx) => {
        const [lookup] = await tx
          .select({ ticketId: escalations.ticketId })
          .from(escalations)
          .where(eq(escalations.id, id));
        if (!lookup) throw new AppError(404, 'Escalation not found');
        // Ticket first: serialize against assignment, lifecycle and escalation creation.
        await permittedTicket(tx, actor, lookup.ticketId, true);
        const [row] = await tx
          .select()
          .from(escalations)
          .where(eq(escalations.id, id))
          .for('update');
        if (!row) throw new AppError(404, 'Escalation not found');
        if (
          row.status !== input.expectedStatus ||
          (action === 'acknowledge' && row.status !== 'open')
        )
          throw new AppError(409, 'Escalation changed. Refresh and review its current state.');
        const status = action === 'acknowledge' ? 'acknowledged' : 'resolved';
        const now = new Date();
        const [saved] = await tx
          .update(escalations)
          .set({
            status,
            ...(action === 'acknowledge'
              ? { acknowledgedBy: actor.id, acknowledgedAt: now }
              : { resolvedBy: actor.id, resolvedAt: now }),
          })
          .where(eq(escalations.id, id))
          .returning();
        await tx.insert(activity).values({
          ticketId: row.ticketId,
          actorId: actor.id,
          action: `Escalation ${status}`,
          oldValue: row.status,
          newValue: status,
          isInternal: true,
        });
        return saved!;
      });
    },
  };
}
