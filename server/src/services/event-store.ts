import { eq } from 'drizzle-orm';
import type { Executor } from '../db/connection.js';
import { operationEvents, tickets, users } from '../db/schema.js';

export const eventTitles: Record<string, string> = {
  ticket_created: 'New ticket created',
  ticket_assigned: 'Ticket assigned',
  ticket_reassigned: 'Ticket reassigned',
  ticket_status_changed: 'Ticket status updated',
  ticket_reply_received: 'New public reply',
  internal_note_created: 'New internal note',
  ticket_resolved: 'Ticket resolved',
  ticket_reopened: 'Ticket reopened',
  resolution_confirmed: 'Resolution confirmed',
  escalation_requested: 'Escalation requested',
  escalation_acknowledged: 'Escalation acknowledged',
  escalation_resolved: 'Escalation resolved',
  attachment_added: 'Attachment added',
  attachment_deleted: 'Attachment removed',
  sla_warning: 'SLA approaching deadline',
  sla_breached: 'SLA deadline exceeded',
  ticket_updated: 'Ticket updated',
};
export async function queueEvent(
  db: Executor,
  input: {
    key: string;
    ticketId: string;
    actorId?: string | null;
    type: string;
    internal?: boolean;
    previousAgent?: string | null;
    at?: Date;
  },
) {
  const [t] = await db.select().from(tickets).where(eq(tickets.id, input.ticketId));
  if (!t) throw new Error('Event ticket missing');
  const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
  const audience = [
    ...new Set([
      ...admins.map((a) => a.id),
      ...(t.assignedAgentId ? [t.assignedAgentId] : []),
      ...(!input.internal ? [t.requesterId] : []),
      ...(input.previousAgent ? [input.previousAgent] : []),
    ]),
  ];
  let recipients = audience.filter((id) => id !== input.actorId && id !== input.previousAgent);
  if (input.type === 'ticket_created' || input.type === 'escalation_requested')
    recipients = admins.map((a) => a.id).filter((id) => id !== input.actorId);
  if (['ticket_assigned', 'ticket_reassigned'].includes(input.type))
    recipients =
      t.assignedAgentId && t.assignedAgentId !== input.actorId ? [t.assignedAgentId] : [];
  if (
    input.type === 'attachment_added' ||
    input.type === 'attachment_deleted' ||
    input.type === 'ticket_updated'
  )
    recipients = [];
  await db
    .insert(operationEvents)
    .values({
      eventKey: input.key,
      ticketId: t.id,
      actorId: input.actorId ?? null,
      type: input.type,
      internal: input.internal ?? false,
      recipients,
      audience,
      createdAt: input.at ?? new Date(),
    })
    .onConflictDoNothing();
}
export async function eligibleRecipient(
  db: Executor,
  userId: string,
  ticketId: string,
  internal: boolean,
) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || u.accountStatus !== 'active' || (internal && u.role === 'employee')) return false;
  const [t] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
  return (
    !!t &&
    (u.role === 'admin' ||
      (u.role === 'agent' ? t.assignedAgentId === u.id : t.requesterId === u.id))
  );
}
