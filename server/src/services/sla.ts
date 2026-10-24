import { and, asc, desc, eq, isNull, lte, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database, Executor } from '../db/connection.js';
import {
  slaPolicies,
  ticketSlas,
  tickets,
  users,
  type Actor,
  type PolicySnapshot,
} from '../db/schema.js';
import { permittedTicket, scope } from '../repositories/tickets.js';
import { AppError } from '../middleware/errors.js';
import { addBusinessMinutes, businessMinutesBetween, calendarInput } from './business-time.js';
import { queueEvent } from './event-store.js';

export const policyInput = z
  .object({
    name: z.string().trim().min(2).max(100),
    responseMinutes: z.number().int().min(1).max(525600),
    resolutionMinutes: z.number().int().min(1).max(525600),
    warningPercent: z.number().int().min(1).max(99),
    calendar: calendarInput,
    active: z.boolean(),
  })
  .strict()
  .refine(
    (p) =>
      Math.max(p.responseMinutes, p.resolutionMinutes) <=
      (p.calendar.endHour - p.calendar.startHour) * 60 * p.calendar.weekdays.length * 1000,
    'Targets exceed the supported business calendar horizon',
  );
export async function startSla(
  db: Executor,
  ticket: typeof tickets.$inferSelect,
  at: Date,
  reopen = false,
) {
  const [previous] = await db
    .select()
    .from(ticketSlas)
    .where(eq(ticketSlas.ticketId, ticket.id))
    .orderBy(desc(ticketSlas.cycle))
    .limit(1);
  if (previous && !reopen) return previous;
  if (!previous && ['resolved', 'closed'].includes(ticket.status)) return undefined;
  const [policy] = await db
    .select()
    .from(slaPolicies)
    .where(and(eq(slaPolicies.priority, ticket.priority), eq(slaPolicies.active, true)));
  if (!policy) return undefined;
  const snapshot: PolicySnapshot = {
    name: policy.name,
    priority: policy.priority,
    responseMinutes: policy.responseMinutes,
    resolutionMinutes: policy.resolutionMinutes,
    warningPercent: policy.warningPercent,
    calendar: policy.calendar,
  };
  const responseWarningAt = addBusinessMinutes(
      at,
      (policy.responseMinutes * policy.warningPercent) / 100,
      policy.calendar,
    ),
    resolutionWarningAt = addBusinessMinutes(
      at,
      (policy.resolutionMinutes * policy.warningPercent) / 100,
      policy.calendar,
    );
  const [saved] = await db
    .insert(ticketSlas)
    .values({
      ticketId: ticket.id,
      cycle: (previous?.cycle ?? 0) + 1,
      policyId: policy.id,
      snapshot,
      startedAt: at,
      responseDueAt: addBusinessMinutes(at, policy.responseMinutes, policy.calendar),
      resolutionDueAt: addBusinessMinutes(at, policy.resolutionMinutes, policy.calendar),
      responseWarningAt,
      resolutionWarningAt,
      nextCheckAt: new Date(Math.min(+responseWarningAt, +resolutionWarningAt)),
    })
    .returning();
  return saved;
}
export async function applySlaOperation(
  db: Executor,
  ticketId: string,
  action: string,
  actorId: string,
  at: Date,
) {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
  if (!ticket) return;
  const reopen =
    action === 'Ticket reopened' || action === 'Closed ticket reopened by administrator';
  let row = await startSla(db, ticket, at, reopen);
  if (!row) return;
  const patch: Partial<typeof ticketSlas.$inferInsert> = {};
  if (action === 'Reply added' && !row.firstRespondedAt && !row.resolvedAt) {
    const [author] = await db.select().from(users).where(eq(users.id, actorId));
    if (author && author.role !== 'employee' && actorId !== ticket.requesterId) {
      patch.firstRespondedAt = at;
      patch.responseMinutes = businessMinutesBetween(row.startedAt, at, row.snapshot.calendar);
      if (at > row.responseDueAt) patch.responseBreachedAt = row.responseDueAt;
    }
  }
  if (action === 'Resolution submitted') {
    patch.resolvedAt = at;
    patch.resolutionMinutes = businessMinutesBetween(row.startedAt, at, row.snapshot.calendar);
    if (at > row.resolutionDueAt) patch.resolutionBreachedAt = row.resolutionDueAt;
    // A resolution without a public reply does not fabricate first response compliance.
    if (!row.firstRespondedAt && at > row.responseDueAt)
      patch.responseBreachedAt = row.responseDueAt;
  }
  if (Object.keys(patch).length) {
    for (const kind of ['response', 'resolution'] as const) {
      if (patch[kind === 'response' ? 'responseBreachedAt' : 'resolutionBreachedAt'])
        await queueEvent(db, {
          key: `sla:${row.id}:${kind}:breach`,
          ticketId,
          actorId,
          type: 'sla_breached',
          at,
        });
    }
    const [saved] = await db
      .update(ticketSlas)
      .set({ ...patch, updatedAt: at })
      .where(eq(ticketSlas.id, row.id))
      .returning();
    row = saved!;
  }
  await scheduleSla(db, row);
}
type Sla = typeof ticketSlas.$inferSelect;
async function scheduleSla(db: Executor, row: Sla) {
  const dates: Date[] = [];
  if (!row.resolvedAt) {
    if (!row.firstRespondedAt && !row.responseBreachedAt)
      dates.push(row.responseWarnedAt ? row.responseDueAt : row.responseWarningAt);
    if (!row.resolutionBreachedAt)
      dates.push(row.resolutionWarnedAt ? row.resolutionDueAt : row.resolutionWarningAt);
  }
  await db
    .update(ticketSlas)
    .set({ nextCheckAt: dates.length ? new Date(Math.min(...dates.map(Number))) : null })
    .where(eq(ticketSlas.id, row.id));
}
export function slaView(row: Sla, now = new Date()) {
  const state = (due: Date, warning: Date, completed: Date | null) =>
    completed
      ? completed <= due
        ? 'Completed Within Target'
        : 'Completed After Breach'
      : now > due
        ? 'Breached'
        : now >= warning
          ? 'Approaching Deadline'
          : 'Within Target';
  return {
    ...row,
    responseState: row.firstRespondedAt
      ? state(row.responseDueAt, row.responseWarningAt, row.firstRespondedAt)
      : row.resolvedAt
        ? row.responseBreachedAt
          ? 'Completed After Breach'
          : 'No qualifying response'
        : state(row.responseDueAt, row.responseWarningAt, null),
    resolutionState: state(row.resolutionDueAt, row.resolutionWarningAt, row.resolvedAt),
    responseRemainingMinutes:
      row.firstRespondedAt || row.resolvedAt
        ? null
        : businessMinutesBetween(now, row.responseDueAt, row.snapshot.calendar),
    resolutionRemainingMinutes: row.resolvedAt
      ? null
      : businessMinutesBetween(now, row.resolutionDueAt, row.snapshot.calendar),
  };
}
export async function monitorSla(db: Database, now = new Date()) {
  // Incremental adoption: existing open tickets start tracking now, never receive invented historical outcomes.
  const legacy = await db
    .select({ id: tickets.id })
    .from(tickets)
    .innerJoin(
      slaPolicies,
      and(eq(slaPolicies.priority, tickets.priority), eq(slaPolicies.active, true)),
    )
    .leftJoin(ticketSlas, eq(ticketSlas.ticketId, tickets.id))
    .where(and(isNull(ticketSlas.id), notInArray(tickets.status, ['resolved', 'closed'])))
    .limit(100);
  for (const t of legacy)
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(tickets).where(eq(tickets.id, t.id)).for('update');
      if (current && !['resolved', 'closed'].includes(current.status))
        await startSla(tx, current, now);
    });
  const due = await db
    .select({ id: ticketSlas.id, ticketId: ticketSlas.ticketId })
    .from(ticketSlas)
    .where(lte(ticketSlas.nextCheckAt, now))
    .orderBy(asc(ticketSlas.nextCheckAt))
    .limit(100);
  for (const item of due)
    await db.transaction(async (tx) => {
      await tx
        .select({ id: tickets.id })
        .from(tickets)
        .where(eq(tickets.id, item.ticketId))
        .for('update');
      const [row] = await tx.select().from(ticketSlas).where(eq(ticketSlas.id, item.id));
      if (!row || row.resolvedAt) return;
      const patch: Partial<typeof ticketSlas.$inferInsert> = {};
      for (const kind of ['response', 'resolution'] as const) {
        if (kind === 'response' && row.firstRespondedAt) continue;
        const breached = kind === 'response' ? row.responseBreachedAt : row.resolutionBreachedAt,
          warned = kind === 'response' ? row.responseWarnedAt : row.resolutionWarnedAt;
        const deadline = kind === 'response' ? row.responseDueAt : row.resolutionDueAt,
          warning = kind === 'response' ? row.responseWarningAt : row.resolutionWarningAt;
        if (!breached && now > deadline) {
          patch[kind === 'response' ? 'responseBreachedAt' : 'resolutionBreachedAt'] = deadline;
          await queueEvent(tx, {
            key: `sla:${row.id}:${kind}:breach`,
            ticketId: row.ticketId,
            type: 'sla_breached',
            at: now,
          });
        } else if (!breached && !warned && now >= warning) {
          patch[kind === 'response' ? 'responseWarnedAt' : 'resolutionWarnedAt'] = now;
          await queueEvent(tx, {
            key: `sla:${row.id}:${kind}:warning`,
            ticketId: row.ticketId,
            type: 'sla_warning',
            at: now,
          });
        }
      }
      if (Object.keys(patch).length)
        await tx
          .update(ticketSlas)
          .set({ ...patch, updatedAt: now })
          .where(eq(ticketSlas.id, row.id));
      await scheduleSla(tx, { ...row, ...patch } as Sla);
    });
}
export function slaService(db: Database) {
  return {
    async ticket(actor: Actor, id: string) {
      await permittedTicket(db, actor, id);
      const rows = await db
        .select({ sla: ticketSlas })
        .from(ticketSlas)
        .innerJoin(tickets, eq(tickets.id, ticketSlas.ticketId))
        .where(and(eq(tickets.id, id), scope(actor)))
        .orderBy(desc(ticketSlas.cycle));
      return rows.map((r) => slaView(r.sla));
    },
    policies: () => db.select().from(slaPolicies).orderBy(asc(slaPolicies.responseMinutes)),
    async update(actor: Actor, id: string, raw: unknown) {
      if (actor.role !== 'admin')
        throw new AppError(403, 'Only administrators can manage SLA policies');
      const input = policyInput.parse(raw);
      const [saved] = await db
        .update(slaPolicies)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(slaPolicies.id, id))
        .returning();
      if (!saved) throw new AppError(404, 'SLA policy not found');
      return saved;
    },
    async overview(actor: Actor) {
      const now = new Date();
      const latest = and(
        scope(actor),
        sql`${ticketSlas.cycle} = (select max(s.cycle) from ticket_slas s where s.ticket_id = ${tickets.id})`,
      );
      const completed = sql`${ticketSlas.resolvedAt} is not null`;
      const compliant = sql`${ticketSlas.resolvedAt} <= ${ticketSlas.resolutionDueAt} and ${ticketSlas.firstRespondedAt} <= ${ticketSlas.responseDueAt}`;
      const approaching = sql`${ticketSlas.resolvedAt} is null and ((${ticketSlas.firstRespondedAt} is null and ${now} >= ${ticketSlas.responseWarningAt} and ${now} <= ${ticketSlas.responseDueAt}) or (${now} >= ${ticketSlas.resolutionWarningAt} and ${now} <= ${ticketSlas.resolutionDueAt}))`;
      const [stats] = await db
        .select({
          tracked: sql<number>`count(*)::int`,
          completed: sql<number>`count(*) filter(where ${completed})::int`,
          compliant: sql<number>`count(*) filter(where ${compliant})::int`,
          approaching: sql<number>`count(*) filter(where ${approaching})::int`,
          responseBreached: sql<number>`count(*) filter(where ${ticketSlas.responseBreachedAt} is not null or (${ticketSlas.resolvedAt} is null and ${ticketSlas.firstRespondedAt} is null and ${now} > ${ticketSlas.responseDueAt}))::int`,
          resolutionBreached: sql<number>`count(*) filter(where ${ticketSlas.resolutionBreachedAt} is not null or (${ticketSlas.resolvedAt} is null and ${now} > ${ticketSlas.resolutionDueAt}))::int`,
          averageResponseMinutes: sql<number | null>`avg(${ticketSlas.responseMinutes})::float8`,
          averageResolutionMinutes: sql<
            number | null
          >`avg(${ticketSlas.resolutionMinutes})::float8`,
          highPriority: sql<number>`count(*) filter(where ${ticketSlas.resolvedAt} is null and ${tickets.priority} in ('high','critical'))::int`,
        })
        .from(ticketSlas)
        .innerJoin(tickets, eq(tickets.id, ticketSlas.ticketId))
        .where(latest);
      const rows = await db
        .select({ sla: ticketSlas, ticket: tickets })
        .from(ticketSlas)
        .innerJoin(tickets, eq(tickets.id, ticketSlas.ticketId))
        .where(and(latest, isNull(ticketSlas.resolvedAt)))
        .orderBy(asc(ticketSlas.resolutionDueAt))
        .limit(20);
      return {
        ...stats!,
        limited: false,
        compliance: stats!.completed ? (100 * stats!.compliant) / stats!.completed : null,
        averageResponseMinutes: actor.role === 'employee' ? null : stats!.averageResponseMinutes,
        averageResolutionMinutes:
          actor.role === 'employee' ? null : stats!.averageResolutionMinutes,
        items: rows.map((r) => ({
          ...slaView(r.sla, now),
          ticketId: r.ticket.id,
          ticketNumber: r.ticket.ticketNumber,
          subject: r.ticket.subject,
          priority: r.ticket.priority,
        })),
      };
    },
  };
}
