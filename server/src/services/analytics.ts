import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import { activity, tickets, users, type Actor } from '../db/schema.js';
import { listTickets, scope } from '../repositories/tickets.js';
export async function analytics(db: Database, actor: Actor, days: number, period = false) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - days + 1);
  const where = and(scope(actor), period ? gte(tickets.createdAt, since) : undefined);
  const [totals, status, priority, volume, agents, recent, performance, recentActivity] =
    await Promise.all([
      db
        .select({
          total: sql<number>`count(*)::int`,
          average: sql<
            number | null
          >`avg(extract(epoch from (${tickets.resolvedAt} - ${tickets.createdAt}))/3600)::float`,
          unassigned: sql<number>`count(*) filter(where ${tickets.assignedAgentId} is null)::int`,
        })
        .from(tickets)
        .where(where),
      db
        .select({ name: tickets.status, value: sql<number>`count(*)::int` })
        .from(tickets)
        .where(where)
        .groupBy(tickets.status),
      db
        .select({ name: tickets.priority, value: sql<number>`count(*)::int` })
        .from(tickets)
        .where(where)
        .groupBy(tickets.priority),
      db
        .select({
          date: sql<string>`to_char(${tickets.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
          received: sql<number>`count(*)::int`,
        })
        .from(tickets)
        .where(and(scope(actor), gte(tickets.createdAt, since)))
        .groupBy(sql`to_char(${tickets.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`)
        .orderBy(sql`1`),
      actor.role === 'admin'
        ? db
            .select({ count: sql<number>`count(*)::int` })
            .from(users)
            .where(and(eq(users.role, 'agent'), eq(users.accountStatus, 'active')))
        : Promise.resolve([]),
      listTickets(db, actor, { page: 1, limit: 5, search: '', sort: 'recent', mine: 'false' }),
      actor.role === 'admin'
        ? db
            .select({
              name: users.fullName,
              assigned: sql<number>`count(${tickets.id})::int`,
              resolved: sql<number>`count(${tickets.id}) filter(where ${tickets.status} in ('resolved','closed'))::int`,
            })
            .from(users)
            .leftJoin(
              tickets,
              and(
                eq(tickets.assignedAgentId, users.id),
                period ? gte(tickets.createdAt, since) : undefined,
              ),
            )
            .where(eq(users.role, 'agent'))
            .groupBy(users.id)
            .orderBy(desc(sql`count(${tickets.id})`))
            .limit(20)
        : Promise.resolve([]),
      db
        .select({
          id: activity.id,
          ticketId: activity.ticketId,
          ticketNumber: tickets.ticketNumber,
          action: activity.action,
          actorName: users.fullName,
          createdAt: activity.createdAt,
        })
        .from(activity)
        .innerJoin(tickets, eq(tickets.id, activity.ticketId))
        .innerJoin(users, eq(users.id, activity.actorId))
        .where(
          and(scope(actor), actor.role === 'employee' ? eq(activity.isInternal, false) : undefined),
        )
        .orderBy(desc(activity.createdAt), desc(activity.id))
        .limit(5),
    ]);
  const resolved = await db
    .select({
      date: sql<string>`to_char(${tickets.resolvedAt} at time zone 'UTC', 'YYYY-MM-DD')`,
      resolved: sql<number>`count(*)::int`,
    })
    .from(tickets)
    .where(and(scope(actor), gte(tickets.resolvedAt, since)))
    .groupBy(sql`to_char(${tickets.resolvedAt} at time zone 'UTC', 'YYYY-MM-DD')`);
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(since);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    return {
      label: date.slice(5),
      received: volume.find((v) => v.date === date)?.received ?? 0,
      resolved: resolved.find((v) => v.date === date)?.resolved ?? 0,
    };
  });
  return {
    ...totals[0],
    activeAgents: agents[0]?.count ?? null,
    status,
    priority,
    series,
    performance,
    recentActivity,
    recent: recent.items,
    sla: null,
    since: since.toISOString(),
  };
}
