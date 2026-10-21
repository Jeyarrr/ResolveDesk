import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import type { Executor } from '../db/connection.js';
import { activity, categories, comments, tickets, users, type Actor } from '../db/schema.js';
import type { ticketQuery } from '../validation/schemas.js';
import { AppError } from '../middleware/errors.js';
export function scope(actor: Actor): SQL {
  return actor.role === 'admin'
    ? sql`true`
    : actor.role === 'agent'
      ? eq(tickets.assignedAgentId, actor.id)
      : eq(tickets.requesterId, actor.id);
}
export async function permittedTicket(db: Executor, actor: Actor, id: string, lock = false) {
  const q = db
    .select()
    .from(tickets)
    .where(and(eq(tickets.id, id), scope(actor)));
  const [ticket] = await (lock ? q.for('update') : q);
  if (!ticket) throw new AppError(404, 'Ticket not found');
  return ticket;
}
const assignee = alias(users, 'assignee');
const requester = alias(users, 'requester');
const resolver = alias(users, 'resolver');
const closer = alias(users, 'closer');
const person = (u: { id: AnyPgColumn; fullName: AnyPgColumn }) => sql<{
  id: string;
  name: string;
  initials: string;
} | null>`
  case when ${u.id} is null then null else json_build_object('id',${u.id},'name',${u.fullName},'initials',upper(left(${u.fullName},1))) end`;
export function ticketRows(db: Executor, where: SQL | undefined) {
  return db
    .select({
      id: tickets.id,
      ticketNumber: tickets.ticketNumber,
      subject: tickets.subject,
      description: tickets.description,
      categoryId: tickets.categoryId,
      category: categories.name,
      priority: tickets.priority,
      status: tickets.status,
      requesterId: tickets.requesterId,
      assignedAgentId: tickets.assignedAgentId,
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
      resolvedAt: tickets.resolvedAt,
      closedAt: tickets.closedAt,
      resolvedBy: tickets.resolvedBy,
      resolutionSummary: tickets.resolutionSummary,
      closedBy: tickets.closedBy,
      lifecycleVersion: tickets.lifecycleVersion,
      resolver: person(resolver),
      closer: person(closer),
      requester: person(requester),
      assignee: person(assignee),
    })
    .from(tickets)
    .innerJoin(categories, eq(categories.id, tickets.categoryId))
    .innerJoin(requester, eq(requester.id, tickets.requesterId))
    .leftJoin(assignee, eq(assignee.id, tickets.assignedAgentId))
    .leftJoin(resolver, eq(resolver.id, tickets.resolvedBy))
    .leftJoin(closer, eq(closer.id, tickets.closedBy))
    .where(where);
}
export async function listTickets(db: Executor, actor: Actor, q: z.infer<typeof ticketQuery>) {
  const escaped = q.search.replace(/[\\%_]/g, '\\$&');
  const where = and(
    scope(actor),
    q.mine === 'true' && actor.role === 'admin' ? eq(tickets.requesterId, actor.id) : undefined,
    q.status ? eq(tickets.status, q.status) : undefined,
    q.priority ? eq(tickets.priority, q.priority) : undefined,
    q.category ? eq(tickets.categoryId, q.category) : undefined,
    escaped
      ? or(
          ilike(tickets.subject, `%${escaped}%`),
          sql`('RD-' || ${tickets.ticketNumber}::text) ilike ${`%${escaped}%`}`,
        )
      : undefined,
  );
  const order =
    q.sort === 'oldest'
      ? asc(tickets.createdAt)
      : q.sort === 'subject'
        ? asc(tickets.subject)
        : q.sort === 'priority'
          ? desc(tickets.priority)
          : desc(tickets.updatedAt);
  const [rows, counts] = await Promise.all([
    ticketRows(db, where)
      .orderBy(order, asc(tickets.id))
      .limit(q.limit)
      .offset((q.page - 1) * q.limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(where),
  ]);
  return { items: rows, total: counts[0]?.count ?? 0, page: q.page, limit: q.limit };
}
export async function ticketComments(db: Executor, actor: Actor, id: string) {
  await permittedTicket(db, actor, id);
  return db
    .select({
      id: comments.id,
      authorId: comments.authorId,
      message: comments.message,
      isInternal: comments.isInternal,
      createdAt: comments.createdAt,
      author: person(users),
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .innerJoin(tickets, eq(tickets.id, comments.ticketId))
    .where(
      and(
        eq(comments.ticketId, id),
        scope(actor),
        actor.role === 'employee' ? eq(comments.isInternal, false) : undefined,
      ),
    )
    .orderBy(asc(comments.createdAt), asc(comments.id));
}
export async function ticketActivity(db: Executor, actor: Actor, id: string) {
  await permittedTicket(db, actor, id);
  return db
    .select({
      id: activity.id,
      actorId: activity.actorId,
      action: activity.action,
      oldValue: activity.oldValue,
      newValue: activity.newValue,
      explanation: activity.explanation,
      lifecycleVersion: activity.lifecycleVersion,
      createdAt: activity.createdAt,
      actor: person(users),
    })
    .from(activity)
    .innerJoin(users, eq(users.id, activity.actorId))
    .innerJoin(tickets, eq(tickets.id, activity.ticketId))
    .where(
      and(
        eq(activity.ticketId, id),
        scope(actor),
        actor.role === 'employee' ? eq(activity.isInternal, false) : undefined,
      ),
    )
    .orderBy(asc(activity.createdAt), asc(activity.lifecycleVersion), asc(activity.id));
}
