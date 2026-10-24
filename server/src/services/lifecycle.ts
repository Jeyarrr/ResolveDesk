import { recordOperation } from './operations.js';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { Database } from '../db/connection.js';
import { tickets, type Actor } from '../db/schema.js';
import { permittedTicket } from '../repositories/tickets.js';
import { AppError } from '../middleware/errors.js';
import {
  confirmationInput,
  reasonInput,
  resolutionInput,
  statusInput,
} from '../validation/schemas.js';

type Ticket = typeof tickets.$inferSelect;
type Status = Ticket['status'];
// Special transitions are reachable only through the validated operations below.
export const transitions: Record<Status, Status[]> = {
  open: ['in_progress', 'pending'],
  in_progress: ['pending', 'resolved'],
  pending: ['in_progress', 'resolved'],
  resolved: ['closed', 'open'],
  closed: ['open'],
};
export function lifecycleActions(
  actor: Pick<Actor, 'id' | 'role'>,
  ticket: Pick<Ticket, 'status' | 'requesterId' | 'assignedAgentId'>,
) {
  const admin = actor.role === 'admin';
  const staff = admin || (actor.role === 'agent' && ticket.assignedAgentId === actor.id);
  const owner = actor.role === 'employee' && ticket.requesterId === actor.id;
  return {
    statusTransitions: staff
      ? transitions[ticket.status].filter((s) => s === 'in_progress' || s === 'pending')
      : [],
    resolve: staff && ['in_progress', 'pending'].includes(ticket.status),
    confirm: owner && ticket.status === 'resolved',
    close: admin && ticket.status === 'resolved',
    reopen:
      ((staff || owner) && ticket.status === 'resolved') || (admin && ticket.status === 'closed'),
  };
}
type Operation =
  | { kind: 'status'; input: z.infer<typeof statusInput> }
  | { kind: 'resolve'; input: z.infer<typeof resolutionInput> }
  | { kind: 'confirm'; input: z.infer<typeof confirmationInput> }
  | { kind: 'close' | 'reopen'; input: z.infer<typeof reasonInput> };

export function lifecycleService(db: Database) {
  async function change(actor: Actor, id: string, operation: Operation) {
    return db.transaction(async (tx) => {
      const ticket = await permittedTicket(tx, actor, id, true);
      const { kind, input } = operation;
      // Scope is checked while acquiring the row lock. Department never grants access.
      if ((kind === 'status' || kind === 'resolve') && actor.role === 'employee')
        throw new AppError(403, 'Only authorized support staff can perform this action');
      if (kind === 'confirm' && (actor.role !== 'employee' || ticket.requesterId !== actor.id))
        throw new AppError(403, 'Only the requester can confirm resolution');
      if (kind === 'close' && actor.role !== 'admin')
        throw new AppError(
          403,
          'Only administrators can close tickets without requester confirmation',
        );
      if (kind === 'reopen' && ticket.status === 'closed' && actor.role !== 'admin')
        throw new AppError(403, 'Only administrators can reopen closed tickets');
      if (input.expectedVersion !== undefined && input.expectedVersion !== ticket.lifecycleVersion)
        throw new AppError(409, 'This ticket changed. Refresh it before trying again.');
      const allowed = lifecycleActions(actor, ticket);
      let status: Status;
      let action: string;
      let explanation: string | null = null;
      if (kind === 'status') {
        status = operation.input.status;
        if (!allowed.statusTransitions.some((next) => next === status))
          throw new AppError(
            409,
            'Use a permitted active status or the resolution, confirmation, or reopening action',
          );
        action = 'Status changed';
      } else {
        if (!allowed[kind]) throw new AppError(409, `Cannot ${kind} a ticket in its current state`);
        status = kind === 'resolve' ? 'resolved' : kind === 'reopen' ? 'open' : 'closed';
        action =
          kind === 'resolve'
            ? 'Resolution submitted'
            : kind === 'confirm'
              ? 'Resolution confirmed and ticket closed'
              : kind === 'close'
                ? 'Ticket closed by administrator'
                : ticket.status === 'closed'
                  ? 'Closed ticket reopened by administrator'
                  : 'Ticket reopened';
        if (kind === 'resolve') explanation = operation.input.summary;
        else if (kind === 'reopen' || kind === 'close') explanation = operation.input.reason;
      }
      if (!transitions[ticket.status].includes(status))
        throw new AppError(409, 'Invalid ticket transition');
      const now = new Date();
      const version = ticket.lifecycleVersion + 1;
      const [saved] = await tx
        .update(tickets)
        .set({
          status,
          updatedAt: now,
          lifecycleVersion: version,
          resolvedAt: kind === 'resolve' ? now : status === 'closed' ? ticket.resolvedAt : null,
          resolvedBy:
            kind === 'resolve' ? actor.id : status === 'closed' ? ticket.resolvedBy : null,
          resolutionSummary:
            kind === 'resolve'
              ? explanation
              : status === 'closed'
                ? ticket.resolutionSummary
                : null,
          closedAt: status === 'closed' ? now : null,
          closedBy: status === 'closed' ? actor.id : null,
        })
        .where(eq(tickets.id, id))
        .returning();
      await recordOperation(tx, {
        ticketId: id,
        actorId: actor.id,
        action,
        oldValue: ticket.status,
        newValue: status,
        explanation,
        lifecycleVersion: version,
        createdAt: now,
        isInternal: false,
      });
      return saved!;
    });
  }
  return {
    status: (actor: Actor, id: string, input: unknown) =>
      change(actor, id, { kind: 'status', input: statusInput.parse(input) }),
    resolve: (actor: Actor, id: string, input: unknown) =>
      change(actor, id, { kind: 'resolve', input: resolutionInput.parse(input) }),
    confirm: (actor: Actor, id: string, input: unknown) =>
      change(actor, id, { kind: 'confirm', input: confirmationInput.parse(input) }),
    close: (actor: Actor, id: string, input: unknown) =>
      change(actor, id, { kind: 'close', input: reasonInput.parse(input) }),
    reopen: (actor: Actor, id: string, input: unknown) =>
      change(actor, id, { kind: 'reopen', input: reasonInput.parse(input) }),
  };
}
