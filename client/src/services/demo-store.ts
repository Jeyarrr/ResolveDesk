import { z } from 'zod';
import { createSeed } from '../data/seed';
import {
  attachmentSchema,
  demoStateSchema,
  preferencesSchema,
  priorities,
  statuses,
  type Attachment,
  type DemoState,
  type Ticket,
  type User,
} from '../types/domain';
import {
  createTicketSchema,
  replySchema,
  type CreateTicketInput,
} from '../features/tickets/schema';
import { readStorage, writeStorage } from '../lib/storage';

export const STORAGE_KEY = 'resolvedesk.demo.v1';
export function restoreDemo(raw: string | null): DemoState {
  try {
    return raw ? demoStateSchema.parse(JSON.parse(raw)) : createSeed();
  } catch {
    return createSeed();
  }
}
export function canViewTicket(user: User, ticket: Ticket) {
  return user.role !== 'employee' || ticket.requesterId === user.id;
}
export function canManageTicket(user: User, ticket: Ticket) {
  return user.role === 'admin' || (user.role === 'agent' && ticket.assigneeId === user.id);
}
export function visibleTickets(user: User, tickets: Ticket[], mine = false) {
  return tickets.filter(
    (ticket) =>
      canViewTicket(user, ticket) &&
      (!mine ||
        (user.role === 'agent' ? ticket.assigneeId === user.id : ticket.requesterId === user.id)),
  );
}
export interface TicketFilters {
  search?: string;
  status?: string;
  priority?: string;
  category?: string;
  sort?: string;
}
export function filterTickets(tickets: Ticket[], filters: TicketFilters) {
  const term = (filters.search ?? '').trim().toLowerCase();
  const filtered = tickets.filter(
    (ticket) =>
      `${ticket.id} ${ticket.subject}`.toLowerCase().includes(term) &&
      (!filters.status || ticket.status === filters.status) &&
      (!filters.priority || ticket.priority === filters.priority) &&
      (!filters.category || ticket.category === filters.category),
  );
  return filtered.sort((a, b) =>
    filters.sort === 'oldest'
      ? a.createdAt.localeCompare(b.createdAt)
      : filters.sort === 'priority'
        ? priorities.indexOf(b.priority) - priorities.indexOf(a.priority)
        : filters.sort === 'subject'
          ? a.subject.localeCompare(b.subject)
          : b.updatedAt.localeCompare(a.updatedAt),
  );
}
export function createDemoStore(
  initial = restoreDemo(readStorage(STORAGE_KEY)),
  persist = (state: DemoState) => writeStorage(STORAGE_KEY, JSON.stringify(state)),
) {
  let state = initial;
  let persistenceWarning = '';
  const listeners = new Set<() => void>();
  const commit = (next: DemoState) => {
    state = next;
    persistenceWarning = persist(state)
      ? ''
      : 'Browser storage is unavailable or full. Changes work in this tab but may not survive a refresh.';
    listeners.forEach((listener) => listener());
  };
  const actor = (id: string) => {
    const user = state.users.find((user) => user.id === id);
    if (!user) throw new Error('Choose a demo role to continue.');
    return user;
  };
  const update = (
    id: string,
    actorId: string,
    mutation: (ticket: Ticket, user: User, now: string) => Ticket,
  ) => {
    const user = actor(actorId);
    const ticket = state.tickets.find((ticket) => ticket.id === id);
    if (!ticket || !canViewTicket(user, ticket))
      throw new Error('This ticket is unavailable for the selected demo role.');
    const now = new Date().toISOString();
    const nextTicket = mutation(ticket, user, now);
    if (nextTicket === ticket) return;
    const recipients = new Set([
      ticket.requesterId,
      nextTicket.assigneeId,
      ...state.users.filter((u) => u.role === 'admin').map((u) => u.id),
    ]);
    recipients.delete(actorId);
    recipients.delete(null);
    commit({
      ...state,
      tickets: state.tickets.map((t) => (t.id === id ? nextTicket : t)),
      notifications: [
        ...Array.from(recipients).map((userId) => ({
          id: crypto.randomUUID(),
          userId: userId!,
          title: `Updated ${ticket.id}`,
          body: nextTicket.activity.at(-1)?.text ?? 'Ticket updated',
          ticketId: id,
          createdAt: now,
          read: false,
        })),
        ...state.notifications,
      ].slice(0, 500),
    });
  };
  return {
    getSnapshot: () => state,
    getPersistenceWarning: () => persistenceWarning,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    createTicket(input: CreateTicketInput, actorId: string, attachments: Attachment[] = []) {
      const data = createTicketSchema.parse(input);
      const safeAttachments = z.array(attachmentSchema).max(3).parse(attachments);
      if (safeAttachments.some((file) => file.size > 5 * 1024 * 1024))
        throw new Error('Each attachment must be 5 MB or smaller.');
      const user = actor(actorId);
      const now = new Date().toISOString();
      const sequence =
        Math.max(
          1000,
          ...state.tickets.map((t) => Number(t.id.replace('RD-', ''))).filter(Number.isFinite),
        ) + 1;
      const ticket: Ticket = {
        ...data,
        id: `RD-${sequence}`,
        status: 'Open',
        requesterId: user.id,
        assigneeId: null,
        createdAt: now,
        updatedAt: now,
        dueAt: new Date(Date.parse(now) + 48 * 3_600_000).toISOString(),
        resolvedAt: null,
        attachments: safeAttachments,
        comments: [],
        activity: [
          { id: crypto.randomUUID(), actorId, text: 'Created this ticket', createdAt: now },
        ],
      };
      commit({ ...state, tickets: [ticket, ...state.tickets] });
      return ticket;
    },
    updateTicket(
      id: string,
      actorId: string,
      input: {
        status?: Ticket['status'];
        priority?: Ticket['priority'];
        assigneeId?: string | null;
      },
    ) {
      const patch = z
        .object({
          status: z.enum(statuses).optional(),
          priority: z.enum(priorities).optional(),
          assigneeId: z.string().nullable().optional(),
        })
        .strict()
        .parse(input);
      update(id, actorId, (ticket, user, now) => {
        if (!canManageTicket(user, ticket))
          throw new Error(
            'Only the assigned agent or an administrator can manage this demo ticket.',
          );
        if (patch.assigneeId !== undefined && user.role !== 'admin')
          throw new Error('Only an administrator can assign tickets.');
        if (
          patch.assigneeId &&
          !state.users.some((u) => u.id === patch.assigneeId && u.role === 'agent')
        )
          throw new Error('Select a valid support agent.');
        const changes: string[] = [];
        if (patch.status && patch.status !== ticket.status)
          changes.push(`Changed status from ${ticket.status} to ${patch.status}`);
        if (patch.priority && patch.priority !== ticket.priority)
          changes.push(`Changed priority from ${ticket.priority} to ${patch.priority}`);
        if (patch.assigneeId !== undefined && patch.assigneeId !== ticket.assigneeId)
          changes.push(
            `Assigned to ${state.users.find((u) => u.id === patch.assigneeId)?.name ?? 'Unassigned'}`,
          );
        if (!changes.length) return ticket;
        const resolvedAt = patch.status
          ? ['Resolved', 'Closed'].includes(patch.status)
            ? (ticket.resolvedAt ?? now)
            : null
          : ticket.resolvedAt;
        return {
          ...ticket,
          ...patch,
          updatedAt: now,
          resolvedAt,
          activity: [
            ...ticket.activity,
            ...changes.map((text) => ({ id: crypto.randomUUID(), actorId, text, createdAt: now })),
          ],
        };
      });
    },
    reply(id: string, actorId: string, body: string) {
      const text = replySchema.parse(body);
      update(id, actorId, (ticket, user, now) => {
        if (user.role === 'agent' && !canManageTicket(user, ticket))
          throw new Error('Replies are available on tickets assigned to you.');
        return {
          ...ticket,
          updatedAt: now,
          comments: [
            ...ticket.comments,
            { id: crypto.randomUUID(), authorId: actorId, body: text, createdAt: now },
          ],
          activity: [
            ...ticket.activity,
            { id: crypto.randomUUID(), actorId, text: 'Added a reply', createdAt: now },
          ],
        };
      });
    },
    markRead(userId: string, id?: string) {
      actor(userId);
      commit({
        ...state,
        notifications: state.notifications.map((n) =>
          n.userId === userId && (!id || n.id === id) ? { ...n, read: true } : n,
        ),
      });
    },
    saveProfile(userId: string, name: string, department: string) {
      actor(userId);
      const profile = z
        .object({
          name: z.string().trim().min(2).max(60),
          department: z.string().trim().min(2).max(60),
        })
        .parse({ name, department });
      commit({
        ...state,
        users: state.users.map((u) =>
          u.id === userId
            ? {
                ...u,
                ...profile,
                initials: profile.name
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase(),
              }
            : u,
        ),
      });
    },
    savePreferences(userId: string, value: z.infer<typeof preferencesSchema>) {
      actor(userId);
      commit({
        ...state,
        preferences: { ...state.preferences, [userId]: preferencesSchema.parse(value) },
      });
    },
    reset() {
      commit(createSeed());
    },
  };
}
export const demoStore = createDemoStore();
