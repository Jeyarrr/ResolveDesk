import { recordOperation } from './operations.js';
import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { Database, Executor, Transaction } from '../db/connection.js';
import { categories, comments, tickets, users, type Actor } from '../db/schema.js';
import { AppError } from '../middleware/errors.js';
import { permittedTicket } from '../repositories/tickets.js';
import type { commentInput, ticketInput, ticketPatch } from '../validation/schemas.js';
import { assignmentInput } from '../validation/schemas.js';
async function categoryExists(db: Executor, id: string) {
  const [row] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.active, true)))
    .for('share');
  if (!row) throw new AppError(400, 'Select an active category');
}
export const recordActivity = (
  db: Executor,
  actor: Actor,
  ticketId: string,
  action: string,
  oldValue?: string | null,
  newValue?: string | null,
  isInternal = false,
) => recordOperation(db, { ticketId, actorId: actor.id, action, oldValue, newValue, isInternal });
export function ticketService(db: Database | Transaction) {
  return {
    async create(actor: Actor, input: z.infer<typeof ticketInput>) {
      if (actor.role === 'agent')
        throw new AppError(
          403,
          'Support agents manage assigned tickets. Contact an administrator to submit a request.',
        );
      return db.transaction(async (tx) => {
        await categoryExists(tx, input.categoryId);
        const [ticket] = await tx
          .insert(tickets)
          .values({ ...input, requesterId: actor.id })
          .returning();
        await recordActivity(tx, actor, ticket!.id, 'Ticket created');
        return ticket!;
      });
    },
    async patch(actor: Actor, id: string, input: z.infer<typeof ticketPatch>) {
      return db.transaction(async (tx) => {
        const ticket = await permittedTicket(tx, actor, id, true);
        if (actor.role !== 'admin')
          throw new AppError(403, 'Only administrators can edit ticket details');
        if (input.categoryId && input.categoryId !== ticket.categoryId)
          await categoryExists(tx, input.categoryId);
        const [saved] = await tx
          .update(tickets)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(tickets.id, id))
          .returning();
        for (const key of Object.keys(input) as (keyof typeof input)[]) {
          if (input[key] !== ticket[key])
            await recordActivity(tx, actor, id, `${key} updated`, ticket[key], input[key]);
        }
        return saved!;
      });
    },
    async assign(
      actor: Actor,
      id: string,
      assignedAgentId: string | null,
      options: { expectedVersion?: number; reason?: string } = {},
    ) {
      if (actor.role !== 'admin') throw new AppError(403, 'Only administrators can assign tickets');
      const input = assignmentInput.parse({ assignedAgentId, ...options });
      return db.transaction(async (tx) => {
        // Consistent lock order: users before tickets; user administration takes the same table lock.
        if (assignedAgentId) {
          const [agent] = await tx
            .select()
            .from(users)
            .where(
              and(
                eq(users.id, assignedAgentId),
                eq(users.role, 'agent'),
                eq(users.accountStatus, 'active'),
              ),
            )
            .for('share');
          if (!agent) throw new AppError(400, 'Choose an active support agent');
        }
        const ticket = await permittedTicket(tx, actor, id, true);
        if (ticket.assignmentVersion !== input.expectedVersion)
          throw new AppError(
            409,
            'Assignment changed. Refresh the ticket and review the current agent.',
          );
        if (ticket.status === 'resolved' || ticket.status === 'closed')
          throw new AppError(409, 'Reopen this ticket before changing its assignment.');
        if (assignedAgentId === ticket.assignedAgentId)
          throw new AppError(409, 'This ticket already has that assignment.');
        if (ticket.assignedAgentId && !input.reason)
          throw new AppError(400, 'A reassignment reason of at least 10 characters is required.');
        const [saved] = await tx
          .update(tickets)
          .set({
            assignedAgentId,
            assignmentVersion: ticket.assignmentVersion + 1,
            updatedAt: new Date(),
          })
          .where(eq(tickets.id, id))
          .returning();
        await recordOperation(tx, {
          ticketId: id,
          actorId: actor.id,
          action: ticket.assignedAgentId ? 'Ticket reassigned' : 'Ticket assigned',
          oldValue: ticket.assignedAgentId,
          newValue: assignedAgentId,
          explanation: input.reason,
          isInternal: true,
        });
        return saved!;
      });
    },
    async comment(actor: Actor, id: string, input: z.infer<typeof commentInput>) {
      return db.transaction(async (tx) => {
        await permittedTicket(tx, actor, id, true);
        if (actor.role === 'employee' && input.isInternal)
          throw new AppError(403, 'Employees cannot add internal notes');
        const [saved] = await tx
          .insert(comments)
          .values({ ...input, ticketId: id, authorId: actor.id })
          .returning();
        await tx.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, id));
        await recordActivity(
          tx,
          actor,
          id,
          input.isInternal ? 'Internal note added' : 'Reply added',
          null,
          null,
          input.isInternal,
        );
        return saved!;
      });
    },
  };
}
