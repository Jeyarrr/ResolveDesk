import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { Database, Executor } from '../db/connection.js';
import {
  activity,
  categories,
  departments,
  ticketSlas,
  tickets,
  users,
  type Actor,
} from '../db/schema.js';
import { AppError } from '../middleware/errors.js';
import { slaView } from './sla.js';
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
export const reportQuery = z
  .object({
    from: date.optional(),
    to: date.optional(),
    status: z.enum(['open', 'in_progress', 'pending', 'resolved', 'closed']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    category: z.uuid().optional(),
    department: z.uuid().optional(),
    agent: z.uuid().optional(),
    interval: z.enum(['day', 'week', 'month']).default('day'),
    format: z.enum(['summary', 'performance', 'agents', 'sla']).optional(),
  })
  .strict();
const average = (values: (number | null)[]) => {
  const a = values.filter((v): v is number => v !== null);
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
};
const median = (values: (number | null)[]) => {
  const a = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  return a.length ? (a[Math.floor((a.length - 1) / 2)]! + a[Math.floor(a.length / 2)]!) / 2 : null;
};
export function csvValue(value: unknown) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[\s]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function csv(headers: string[], rows: unknown[][]) {
  return '\ufeff' + [headers, ...rows].map((row) => row.map(csvValue).join(',')).join('\r\n');
}
function bucket(at: Date, interval: string) {
  const d = new Date(+at + 8 * 3600000);
  if (interval === 'month') return d.toISOString().slice(0, 7);
  if (interval === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
async function buildReport(db: Executor, actor: Actor, raw: unknown, now = new Date()) {
  if (actor.role !== 'admin') throw new AppError(403, 'Reports are available to administrators');
  const q = reportQuery.parse(raw),
    to = q.to ?? new Date(+now + 8 * 3600000).toISOString().slice(0, 10),
    from = q.from ?? new Date(+now - 29 * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
  const start = new Date(from + 'T00:00:00+08:00'),
    end = new Date(+new Date(to + 'T00:00:00+08:00') + 86400000);
  if (+end <= +start || +end - +start > 366 * 86400000)
    throw new AppError(400, 'Choose an increasing date range of at most 366 days');
  const requester = alias(users, 'report_requester'),
    agent = alias(users, 'report_agent');
  const condition = and(
    gte(tickets.createdAt, start),
    lt(tickets.createdAt, end),
    q.status ? eq(tickets.status, q.status) : undefined,
    q.priority ? eq(tickets.priority, q.priority) : undefined,
    q.category ? eq(tickets.categoryId, q.category) : undefined,
    q.department ? eq(requester.departmentId, q.department) : undefined,
    q.agent ? eq(tickets.assignedAgentId, q.agent) : undefined,
  );
  const rows = await db
    .select({
      id: tickets.id,
      number: tickets.ticketNumber,
      subject: tickets.subject,
      status: tickets.status,
      priority: tickets.priority,
      category: categories.name,
      department: departments.name,
      agentId: agent.id,
      agent: agent.fullName,
      createdAt: tickets.createdAt,
      resolvedAt: tickets.resolvedAt,
    })
    .from(tickets)
    .innerJoin(requester, eq(requester.id, tickets.requesterId))
    .innerJoin(categories, eq(categories.id, tickets.categoryId))
    .leftJoin(departments, eq(departments.id, requester.departmentId))
    .leftJoin(agent, eq(agent.id, tickets.assignedAgentId))
    .where(condition)
    .orderBy(tickets.createdAt, tickets.id)
    .limit(10001);
  if (rows.length > 10000)
    throw new AppError(413, 'This report exceeds 10,000 tickets. Narrow the filters.');
  const slas = await db
    .select({ sla: ticketSlas })
    .from(ticketSlas)
    .innerJoin(tickets, eq(tickets.id, ticketSlas.ticketId))
    .innerJoin(requester, eq(requester.id, tickets.requesterId))
    .where(condition)
    .orderBy(ticketSlas.ticketId, ticketSlas.cycle)
    .limit(20001);
  if (slas.length > 20000)
    throw new AppError(413, 'This report exceeds 20,000 SLA cycles. Narrow the filters.');
  const cycles = slas.map((r) => slaView(r.sla, now));
  const [reopens] = await db
    .select({
      count: sql<number>`count(*)::int`,
      tickets: sql<number>`count(distinct ${activity.ticketId})::int`,
    })
    .from(activity)
    .innerJoin(tickets, eq(tickets.id, activity.ticketId))
    .innerJoin(requester, eq(requester.id, tickets.requesterId))
    .where(
      and(
        condition,
        sql`${activity.action} IN ('Ticket reopened','Closed ticket reopened by administrator')`,
      ),
    );
  const distribution = (key: 'status' | 'priority' | 'category' | 'department') => {
    const names =
      key === 'status'
        ? ['open', 'in_progress', 'pending', 'resolved', 'closed']
        : key === 'priority'
          ? ['low', 'medium', 'high', 'critical']
          : [];
    const counts = new Map<string, number>(names.map((name) => [name, 0]));
    for (const row of rows) {
      const name = row[key] ?? 'Unassigned';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts].map(([name, value]) => ({ name, value }));
  };
  const completed = cycles.filter((c) => c.resolvedAt),
    compliant = completed.filter(
      (c) =>
        c.responseState === 'Completed Within Target' &&
        c.resolutionState === 'Completed Within Target',
    );
  const responseCompleted = cycles.filter((c) => c.firstRespondedAt),
    responseMet = responseCompleted.filter((c) => c.responseState === 'Completed Within Target');
  const resolutionMet = completed.filter((c) => c.resolutionState === 'Completed Within Target');
  const latest = new Map<string, (typeof cycles)[number]>();
  for (const c of cycles) latest.set(c.ticketId, c);
  const active = [...latest.values()].filter((c) => !c.resolvedAt);
  const seriesMap = new Map<
    string,
    { label: string; received: number; resolved: number; breaches: number; resolution: number[] }
  >();
  for (let cursor = +start; cursor < +end; cursor += 86400000) {
    const label = bucket(new Date(cursor), q.interval);
    if (!seriesMap.has(label))
      seriesMap.set(label, { label, received: 0, resolved: 0, breaches: 0, resolution: [] });
  }
  for (const r of rows) seriesMap.get(bucket(r.createdAt, q.interval))!.received++;
  for (const c of cycles) {
    if (c.resolvedAt && c.resolvedAt >= start && c.resolvedAt < end) {
      const b = seriesMap.get(bucket(c.resolvedAt, q.interval))!;
      b.resolved++;
      if (c.resolutionMinutes !== null) b.resolution.push(c.resolutionMinutes);
    }
    for (const at of [c.responseBreachedAt, c.resolutionBreachedAt])
      if (at && at >= start && at < end) seriesMap.get(bucket(at, q.interval))!.breaches++;
  }
  const agents = Object.values(
    rows.reduce<
      Record<
        string,
        {
          id: string;
          name: string;
          assigned: number;
          resolved: number;
          open: number;
          response: (number | null)[];
          resolution: (number | null)[];
          completed: number;
          compliant: number;
          breaches: number;
        }
      >
    >((acc, r) => {
      if (!r.agentId) return acc;
      const a = (acc[r.agentId] ??= {
        id: r.agentId,
        name: r.agent ?? 'Agent',
        assigned: 0,
        resolved: 0,
        open: 0,
        response: [],
        resolution: [],
        completed: 0,
        compliant: 0,
        breaches: 0,
      });
      a.assigned++;
      if (['resolved', 'closed'].includes(r.status)) a.resolved++;
      else a.open++;
      const c = latest.get(r.id);
      if (c) {
        a.response.push(c.responseMinutes);
        a.resolution.push(c.resolutionMinutes);
        if (c.resolvedAt) {
          a.completed++;
          if (
            c.responseState === 'Completed Within Target' &&
            c.resolutionState === 'Completed Within Target'
          )
            a.compliant++;
        }
        if (c.responseBreachedAt || c.resolutionBreachedAt) a.breaches++;
      }
      return acc;
    }, {}),
  )
    .map((a) => ({
      id: a.id,
      name: a.name,
      assigned: a.assigned,
      resolved: a.resolved,
      open: a.open,
      averageResponseMinutes: average(a.response),
      averageResolutionMinutes: average(a.resolution),
      compliance: a.completed ? (100 * a.compliant) / a.completed : null,
      breaches: a.breaches,
    }))
    .sort((a, b) => b.assigned - a.assigned);
  const breachPriority = ['low', 'medium', 'high', 'critical'].map((name) => ({
    name,
    value: cycles.filter(
      (c) => c.snapshot.priority === name && (c.responseBreachedAt || c.resolutionBreachedAt),
    ).length,
  }));
  const metrics = {
    total: rows.length,
    reopenedTickets: reopens?.tickets ?? 0,
    reopenEvents: reopens?.count ?? 0,
    reopenFrequency: rows.length ? (100 * (reopens?.tickets ?? 0)) / rows.length : null,
    averageResponseMinutes: average(cycles.map((c) => c.responseMinutes)),
    averageResolutionMinutes: average(cycles.map((c) => c.resolutionMinutes)),
    medianResolutionMinutes: median(cycles.map((c) => c.resolutionMinutes)),
    tracked: latest.size,
    active: active.length,
    completed: completed.length,
    compliant: compliant.length,
    compliance: completed.length ? (100 * compliant.length) / completed.length : null,
    responseCompliance: responseCompleted.length
      ? (100 * responseMet.length) / responseCompleted.length
      : null,
    resolutionCompliance: completed.length ? (100 * resolutionMet.length) / completed.length : null,
    missingResponse: completed.filter((c) => !c.firstRespondedAt).length,
    approaching: active.filter((c) =>
      [c.responseState, c.resolutionState].includes('Approaching Deadline'),
    ).length,
    responseBreached: cycles.filter((c) => c.responseBreachedAt || c.responseState === 'Breached')
      .length,
    resolutionBreached: cycles.filter(
      (c) => c.resolutionBreachedAt || c.resolutionState === 'Breached',
    ).length,
  };
  const data = {
    filters: { ...q, from, to, timezone: 'Asia/Manila' },
    metrics,
    status: distribution('status'),
    priority: distribution('priority'),
    categories: distribution('category'),
    departments: distribution('department'),
    agents,
    breachPriority,
    series: [...seriesMap.values()].map((b) => ({
      label: b.label,
      received: b.received,
      resolved: b.resolved,
      breaches: b.breaches,
      averageResolutionMinutes: average(b.resolution),
    })),
    approaching: active
      .filter((c) => [c.responseState, c.resolutionState].includes('Approaching Deadline'))
      .slice(0, 100)
      .map((c) => ({
        ticketId: c.ticketId,
        responseDueAt: c.responseDueAt,
        resolutionDueAt: c.resolutionDueAt,
      })),
  };
  const format = q.format ?? 'summary';
  const ticketNumbers = new Map(rows.map((r) => [r.id, r.number]));
  const exportRows =
    format === 'agents'
      ? agents.map((a) => [
          a.name,
          a.assigned,
          a.open,
          a.resolved,
          a.averageResponseMinutes,
          a.averageResolutionMinutes,
          a.compliance,
        ])
      : format === 'sla'
        ? cycles.map((c) => [
            `RD-${ticketNumbers.get(c.ticketId)}`,
            c.cycle,
            c.snapshot.name,
            c.startedAt.toISOString(),
            c.responseDueAt.toISOString(),
            c.resolutionDueAt.toISOString(),
            c.responseState,
            c.resolutionState,
          ])
        : rows.map((r) => {
            const c = latest.get(r.id);
            return format === 'performance'
              ? [
                  `RD-${r.number}`,
                  r.status,
                  r.agent,
                  c?.responseMinutes,
                  c?.resolutionMinutes,
                  c?.cycle,
                ]
              : [
                  `RD-${r.number}`,
                  r.subject,
                  r.status,
                  r.priority,
                  r.category,
                  r.department,
                  r.agent,
                  r.createdAt.toISOString(),
                ];
          });
  const headers =
    format === 'agents'
      ? [
          'Agent',
          'Assigned',
          'Open workload',
          'Resolved',
          'Avg response business minutes',
          'Avg resolution business minutes',
          'Completed SLA compliance %',
        ]
      : format === 'sla'
        ? [
            'Ticket',
            'Cycle',
            'Policy',
            'Started UTC',
            'Response due UTC',
            'Resolution due UTC',
            'Response outcome',
            'Resolution outcome',
          ]
        : format === 'performance'
          ? [
              'Ticket',
              'Status',
              'Current agent',
              'First response business minutes',
              'Resolution business minutes',
              'Latest cycle',
            ]
          : [
              'Ticket',
              'Subject',
              'Status',
              'Priority',
              'Category',
              'Requester department',
              'Current agent',
              'Created UTC',
            ];
  return {
    data,
    csv: () => csv(headers, exportRows),
    filename: `resolvedesk-${format}-${from}-to-${to}.csv`,
  };
}

export function reports(db: Database, actor: Actor, raw: unknown, now = new Date()) {
  return db.transaction((tx) => buildReport(tx, actor, raw, now), {
    isolationLevel: 'repeatable read',
    accessMode: 'read only',
  });
}
