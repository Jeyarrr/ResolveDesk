import { and, desc, eq, isNull, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/connection.js';
import {
  notificationPreferences,
  notifications,
  operationEvents,
  tickets,
  type Actor,
} from '../db/schema.js';
import { scope } from '../repositories/tickets.js';
import { pagination } from '../validation/schemas.js';
import { AppError } from '../middleware/errors.js';
import { eligibleRecipient, eventTitles } from './event-store.js';
export const preferenceInput = z
  .object({
    assignments: z.boolean(),
    replies: z.boolean(),
    status: z.boolean(),
    escalations: z.boolean(),
    sla: z.boolean(),
  })
  .strict();
export const defaultPreferences = {
  assignments: true,
  replies: true,
  status: true,
  escalations: true,
  sla: true,
};
function visible(actor: Actor) {
  return and(
    eq(notifications.recipientId, actor.id),
    scope(actor),
    actor.role === 'employee' ? eq(notifications.internal, false) : undefined,
  );
}
export function preferenceCategory(type: string): keyof typeof defaultPreferences {
  return type.startsWith('sla_')
    ? 'sla'
    : type.startsWith('escalation_')
      ? 'escalations'
      : type.includes('assigned')
        ? 'assignments'
        : type.includes('reply') || type.includes('note')
          ? 'replies'
          : 'status';
}
export async function processEvents(
  db: Database,
  broadcast: (event: typeof operationEvents.$inferSelect) => Promise<void> = async () => {},
) {
  // Row claims serialize concurrent workers; insert + processed marker commit together.
  for (let i = 0; i < 100; i++) {
    const event = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(operationEvents)
        .where(isNull(operationEvents.processedAt))
        .orderBy(operationEvents.createdAt, operationEvents.id)
        .limit(1)
        .for('update', { skipLocked: true });
      if (!row) return null;
      for (const recipientId of row.recipients) {
        if (!(await eligibleRecipient(tx, recipientId, row.ticketId, row.internal))) continue;
        const [prefs] = await tx
          .select()
          .from(notificationPreferences)
          .where(eq(notificationPreferences.userId, recipientId));
        if (prefs && !prefs[preferenceCategory(row.type)]) continue;
        await tx
          .insert(notifications)
          .values({
            eventId: row.id,
            recipientId,
            ticketId: row.ticketId,
            type: row.type,
            title:
              (eventTitles[row.type] ?? 'Ticket updated') +
              (row.type.startsWith('sla_')
                ? row.eventKey.includes(':response:')
                  ? ' - First response'
                  : ' - Resolution'
                : ''),
            internal: row.internal,
            createdAt: row.createdAt,
          })
          .onConflictDoNothing();
      }
      await tx
        .update(operationEvents)
        .set({ processedAt: new Date() })
        .where(eq(operationEvents.id, row.id));
      return row;
    });
    if (!event) break;
    // Notifications are durable even if this best-effort invalidation fails. Reconnect refetches REST.
    await broadcast(event);
  }
}
export function notificationService(db: Database) {
  return {
    async list(actor: Actor, raw: unknown) {
      const q = pagination
        .extend({ state: z.enum(['all', 'read', 'unread']).default('all') })
        .strict()
        .parse(raw);
      const condition = and(
        visible(actor),
        q.state === 'unread'
          ? isNull(notifications.readAt)
          : q.state === 'read'
            ? isNotNull(notifications.readAt)
            : undefined,
      );
      const items = await db
        .select({
          id: notifications.id,
          ticketId: notifications.ticketId,
          ticketNumber: tickets.ticketNumber,
          type: notifications.type,
          title: notifications.title,
          readAt: notifications.readAt,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .innerJoin(tickets, eq(tickets.id, notifications.ticketId))
        .where(condition)
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(q.limit)
        .offset((q.page - 1) * q.limit);
      const [total] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .innerJoin(tickets, eq(tickets.id, notifications.ticketId))
        .where(condition);
      return { items, total: total?.count ?? 0, page: q.page, limit: q.limit };
    },
    async count(actor: Actor) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .innerJoin(tickets, eq(tickets.id, notifications.ticketId))
        .where(and(visible(actor), isNull(notifications.readAt)));
      return { count: row?.count ?? 0 };
    },
    async read(actor: Actor, id: string | null) {
      return db.transaction(async (tx) => {
        const condition = and(
          eq(notifications.recipientId, actor.id),
          id ? eq(notifications.id, id) : undefined,
          actor.role === 'employee' ? eq(notifications.internal, false) : undefined,
          sql`exists (select 1 from ${tickets} where ${tickets.id}=${notifications.ticketId} and ${scope(actor)})`,
        );
        if (id) {
          const [own] = await tx
            .select({ id: notifications.id })
            .from(notifications)
            .where(condition);
          if (!own) throw new AppError(404, 'Notification not found');
        }
        const result = await tx.execute<{ count: number }>(
          sql`with changed as (update ${notifications} set read_at=now() where ${condition} and ${notifications.readAt} is null returning id) select count(*)::int as count from changed`,
        );
        return { updated: result.rows[0]?.count ?? 0 };
      });
    },
    async preferences(actor: Actor) {
      const [p] = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, actor.id));
      return p
        ? {
            assignments: p.assignments,
            replies: p.replies,
            status: p.status,
            escalations: p.escalations,
            sla: p.sla,
          }
        : defaultPreferences;
    },
    async savePreferences(actor: Actor, raw: unknown) {
      const input = preferenceInput.parse(raw);
      await db
        .insert(notificationPreferences)
        .values({ userId: actor.id, ...input })
        .onConflictDoUpdate({
          target: notificationPreferences.userId,
          set: { ...input, updatedAt: new Date() },
        });
      return input;
    },
  };
}
