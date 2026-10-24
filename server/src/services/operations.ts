import type { Executor } from '../db/connection.js';
import { activity } from '../db/schema.js';
import { applySlaOperation } from './sla.js';
import { queueEvent } from './event-store.js';
const types: Record<string, string> = {
  'Ticket created': 'ticket_created',
  'Ticket assigned': 'ticket_assigned',
  'Ticket reassigned': 'ticket_reassigned',
  'Status changed': 'ticket_status_changed',
  'Reply added': 'ticket_reply_received',
  'Internal note added': 'internal_note_created',
  'Resolution submitted': 'ticket_resolved',
  'Resolution confirmed and ticket closed': 'resolution_confirmed',
  'Ticket closed by administrator': 'ticket_status_changed',
  'Ticket reopened': 'ticket_reopened',
  'Closed ticket reopened by administrator': 'ticket_reopened',
  'Escalation requested': 'escalation_requested',
  'Escalation acknowledged': 'escalation_acknowledged',
  'Escalation resolved': 'escalation_resolved',
  'Attachments uploaded': 'attachment_added',
  'Attachment deleted': 'attachment_deleted',
};
// Call inside the same transaction and ticket lock as the business mutation.
export async function recordOperation(db: Executor, input: typeof activity.$inferInsert) {
  const [event] = await db.insert(activity).values(input).returning();
  await applySlaOperation(db, event!.ticketId, event!.action, event!.actorId, event!.createdAt);
  await queueEvent(db, {
    key: `activity:${event!.id}`,
    ticketId: event!.ticketId,
    actorId: event!.actorId,
    type: types[event!.action] ?? 'ticket_updated',
    internal:
      event!.isInternal && !['Ticket assigned', 'Ticket reassigned'].includes(event!.action),
    at: event!.createdAt,
    previousAgent: event!.action === 'Ticket reassigned' ? event!.oldValue : null,
  });
  return event;
}
