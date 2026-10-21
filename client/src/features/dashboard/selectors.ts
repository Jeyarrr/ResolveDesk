import type { Ticket, User } from '../../types/domain';
import { statuses, priorities } from '../../types/domain';
import { DEMO_REFERENCE } from '../../data/seed';
export const isResolved = (ticket: Ticket) =>
  ticket.status === 'Resolved' || ticket.status === 'Closed';
export function ticketMetrics(tickets: Ticket[]) {
  const resolved = tickets.filter(isResolved);
  const hours = resolved.reduce(
    (sum, t) =>
      sum +
      Math.max(0, Date.parse(t.resolvedAt ?? t.updatedAt) - Date.parse(t.createdAt)) / 3_600_000,
    0,
  );
  return {
    total: tickets.length,
    open: tickets.filter((t) => t.status === 'Open').length,
    progress: tickets.filter((t) => t.status === 'In progress').length,
    pending: tickets.filter((t) => t.status === 'Pending').length,
    resolved: resolved.length,
    urgent: tickets.filter(
      (t) => !isResolved(t) && (t.priority === 'High' || t.priority === 'Critical'),
    ).length,
    average: resolved.length ? hours / resolved.length : 0,
    sla: resolved.length
      ? (resolved.filter((t) => Date.parse(t.resolvedAt ?? t.updatedAt) <= Date.parse(t.dueAt))
          .length /
          resolved.length) *
        100
      : null,
  };
}
export function distribution(tickets: Ticket[], kind: 'status' | 'priority') {
  return (kind === 'status' ? statuses : priorities).map((name) => ({
    name,
    value: tickets.filter((t) => t[kind] === name).length,
  }));
}
export function reportWindow(tickets: Ticket[], days: number) {
  const end = Math.max(Date.parse(DEMO_REFERENCE), ...tickets.map((t) => Date.parse(t.createdAt)));
  const start = end - days * 86_400_000;
  return {
    tickets: tickets.filter(
      (t) => Date.parse(t.createdAt) > start && Date.parse(t.createdAt) <= end,
    ),
    start,
    end,
  };
}
export function volumeSeries(tickets: Ticket[], days = 14) {
  const { start, end } = reportWindow(tickets, days);
  const buckets = Math.min(days, 14);
  const width = (end - start) / buckets;
  return Array.from({ length: buckets }, (_, i) => {
    const lower = start + i * width;
    const upper = lower + width;
    return {
      label: new Date(upper).toLocaleDateString('en', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }),
      received: tickets.filter(
        (t) => Date.parse(t.createdAt) > lower && Date.parse(t.createdAt) <= upper,
      ).length,
      resolved: tickets.filter(
        (t) =>
          t.resolvedAt && Date.parse(t.resolvedAt) > lower && Date.parse(t.resolvedAt) <= upper,
      ).length,
    };
  });
}
export function performance(tickets: Ticket[], users: User[]) {
  return users
    .filter((u) => u.role === 'agent')
    .map((u) => ({
      name: u.name.split(' ')[0]!,
      assigned: tickets.filter((t) => t.assigneeId === u.id).length,
      resolved: tickets.filter((t) => t.assigneeId === u.id && isResolved(t)).length,
    }));
}
