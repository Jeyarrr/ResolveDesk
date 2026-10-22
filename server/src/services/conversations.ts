import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/connection.js';
import {
  comments,
  conversationReads,
  responseTemplates,
  tickets,
  users,
  type Actor,
} from '../db/schema.js';
import { permittedTicket, scope, unreadCondition } from '../repositories/tickets.js';
import { AppError } from '../middleware/errors.js';
import { pagination } from '../validation/schemas.js';

const readInput = z
  .object({ throughPosition: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) })
  .strict();
const templateInput = z
  .object({ title: z.string().trim().min(2).max(100), body: z.string().trim().min(1).max(5000) })
  .strict();
export function conversationService(db: Database) {
  return {
    async state(actor: Actor, id: string) {
      await permittedTicket(db, actor, id);
      const [state] = await db
        .select({
          unreadCount: sql<number>`count(*) filter (where ${unreadCondition(actor)})::int`,
          latestPosition: sql<number>`coalesce(max(${comments.position}),0)::float8`,
          lastPosition: sql<number>`coalesce(max(${conversationReads.lastPosition}),0)::float8`,
        })
        .from(tickets)
        .leftJoin(
          comments,
          and(
            eq(comments.ticketId, tickets.id),
            actor.role === 'employee' ? eq(comments.isInternal, false) : undefined,
          ),
        )
        .leftJoin(
          conversationReads,
          and(eq(conversationReads.ticketId, tickets.id), eq(conversationReads.userId, actor.id)),
        )
        .where(and(eq(tickets.id, id), scope(actor)));
      return state!;
    },
    async read(actor: Actor, id: string, body: unknown) {
      const input = readInput.parse(body);
      return db.transaction(async (tx) => {
        await permittedTicket(tx, actor, id, true);
        if (input.throughPosition) {
          const [visible] = await tx
            .select({ id: comments.id })
            .from(comments)
            .where(
              and(
                eq(comments.ticketId, id),
                eq(comments.position, input.throughPosition),
                actor.role === 'employee' ? eq(comments.isInternal, false) : undefined,
              ),
            );
          if (!visible)
            throw new AppError(400, 'Read position must refer to a visible message in this ticket');
        }
        const [saved] = await tx
          .insert(conversationReads)
          .values({ ticketId: id, userId: actor.id, lastPosition: input.throughPosition })
          .onConflictDoUpdate({
            target: [conversationReads.ticketId, conversationReads.userId],
            set: {
              lastPosition: sql`greatest(${conversationReads.lastPosition}, ${input.throughPosition})`,
              updatedAt: new Date(),
            },
          })
          .returning();
        return { lastPosition: saved!.lastPosition };
      });
    },
    async templates(actor: Actor, raw: unknown) {
      if (actor.role === 'employee')
        throw new AppError(403, 'Saved replies are available to support staff');
      const q = pagination.strict().parse(raw);
      const search = q.search.replace(/[\\%_]/g, '\\$&');
      const where = and(
        eq(responseTemplates.active, true),
        search ? sql`${responseTemplates.title} ilike ${`%${search}%`}` : undefined,
      );
      const [items, totals] = await Promise.all([
        db
          .select({
            id: responseTemplates.id,
            title: responseTemplates.title,
            body: responseTemplates.body,
            createdBy: responseTemplates.createdBy,
            authorName: users.fullName,
            canManage: sql<boolean>`${actor.role === 'admin'} OR ${responseTemplates.createdBy} = ${actor.id}`,
            updatedAt: responseTemplates.updatedAt,
          })
          .from(responseTemplates)
          .innerJoin(users, eq(users.id, responseTemplates.createdBy))
          .where(where)
          .orderBy(asc(responseTemplates.title), asc(responseTemplates.id))
          .limit(q.limit)
          .offset((q.page - 1) * q.limit),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(responseTemplates)
          .where(where),
      ]);
      return { items, total: totals[0]?.count ?? 0, page: q.page, limit: q.limit };
    },
    async saveTemplate(actor: Actor, id: string | null, body: unknown, archive = false) {
      if (actor.role === 'employee')
        throw new AppError(403, 'Only support staff can manage saved replies');
      const input = archive ? z.object({}).strict().parse(body) : templateInput.parse(body);
      return db.transaction(async (tx) => {
        if (!id) {
          const data = templateInput.parse(input);
          const [saved] = await tx
            .insert(responseTemplates)
            .values({ ...data, createdBy: actor.id })
            .returning();
          return saved!;
        }
        const [existing] = await tx
          .select()
          .from(responseTemplates)
          .where(and(eq(responseTemplates.id, id), eq(responseTemplates.active, true)))
          .for('update');
        if (!existing) throw new AppError(404, 'Saved reply not found');
        if (actor.role !== 'admin' && existing.createdBy !== actor.id)
          throw new AppError(403, 'You can manage only your own saved replies');
        const [saved] = await tx
          .update(responseTemplates)
          .set({ ...input, ...(archive ? { active: false } : {}), updatedAt: new Date() })
          .where(eq(responseTemplates.id, id))
          .returning();
        return saved!;
      });
    },
  };
}
