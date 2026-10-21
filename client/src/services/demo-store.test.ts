import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeed } from '../data/seed';
import {
  canManageTicket,
  canViewTicket,
  createDemoStore,
  filterTickets,
  restoreDemo,
  visibleTickets,
} from './demo-store';
import type { CreateTicketInput } from '../features/tickets/schema';
const input: CreateTicketInput = {
  subject: 'Replacement monitor request',
  description: 'The monitor flickers even when connected to another laptop.',
  category: 'Hardware',
  priority: 'High',
};
describe('demo ticket lifecycle', () => {
  let persist = vi.fn(() => true);
  let store = createDemoStore(createSeed(), persist);
  beforeEach(() => {
    persist = vi.fn(() => true);
    store = createDemoStore(createSeed(), persist);
  });
  it('creates a unique ticket, persists metadata, and records activity', () => {
    const ticket = store.createTicket(input, 'u-employee', [
      { name: 'screen.png', size: 1200, type: 'image/png' },
    ]);
    expect(ticket.id).toBe('RD-1049');
    expect(ticket.status).toBe('Open');
    expect(ticket.requesterId).toBe('u-employee');
    expect(ticket.activity).toHaveLength(1);
    expect(ticket.attachments[0]?.name).toBe('screen.png');
    expect(store.createTicket(input, 'u-employee').id).toBe('RD-1050');
    expect(persist).toHaveBeenCalledTimes(2);
  });
  it('rejects invalid ticket inputs without mutating state', () => {
    expect(() => store.createTicket({ ...input, subject: '' }, 'u-employee')).toThrow();
    expect(store.getSnapshot().tickets).toHaveLength(48);
    expect(persist).not.toHaveBeenCalled();
  });
  it('rejects oversized and excessive attachment metadata', () => {
    expect(() =>
      store.createTicket(input, 'u-employee', [
        { name: 'large.png', size: 6 * 1024 * 1024, type: 'image/png' },
      ]),
    ).toThrow();
    expect(() =>
      store.createTicket(
        input,
        'u-employee',
        Array.from({ length: 4 }, () => ({ name: 'a', size: 1, type: 'text/plain' })),
      ),
    ).toThrow();
  });
  it('restores created tickets and status history across store initialization', () => {
    const ticket = store.createTicket(input, 'u-employee');
    store.updateTicket(ticket.id, 'u-admin', { status: 'In progress', assigneeId: 'u-agent' });
    store.updateTicket(ticket.id, 'u-agent', { status: 'Resolved', priority: 'Low' });
    const restored = createDemoStore(restoreDemo(JSON.stringify(store.getSnapshot())), persist);
    const saved = restored.getSnapshot().tickets.find((t) => t.id === ticket.id)!;
    expect(saved.status).toBe('Resolved');
    expect(saved.priority).toBe('Low');
    expect(saved.resolvedAt).not.toBeNull();
    expect(
      saved.activity.some((a) => a.text === 'Changed status from In progress to Resolved'),
    ).toBe(true);
  });
  it('clears resolved time on reopening', () => {
    const ticket = store.createTicket(input, 'u-employee');
    store.updateTicket(ticket.id, 'u-admin', { status: 'Resolved' });
    store.updateTicket(ticket.id, 'u-admin', { status: 'Open' });
    expect(store.getSnapshot().tickets.find((t) => t.id === ticket.id)?.resolvedAt).toBeNull();
  });
  it('keeps employees from managing tickets and unassigned agents from updating', () => {
    const ticket = store.createTicket(input, 'u-employee');
    expect(() => store.updateTicket(ticket.id, 'u-employee', { status: 'Resolved' })).toThrow();
    expect(() => store.updateTicket(ticket.id, 'u-agent', { status: 'Resolved' })).toThrow();
  });
  it('limits assignment to administrators and valid agents', () => {
    const ticket = store.createTicket(input, 'u-employee');
    store.updateTicket(ticket.id, 'u-admin', { assigneeId: 'u-agent' });
    expect(() => store.updateTicket(ticket.id, 'u-agent', { assigneeId: 'u-sam' })).toThrow();
    expect(() => store.updateTicket(ticket.id, 'u-admin', { assigneeId: 'u-noah' })).toThrow();
  });
  it('supports requester replies and local unread notifications', () => {
    const ticket = store.createTicket(input, 'u-employee');
    store.reply(ticket.id, 'u-employee', 'I have tried a different cable.');
    expect(store.getSnapshot().tickets[0]?.comments[0]?.body).toBe(
      'I have tried a different cable.',
    );
    expect(
      store
        .getSnapshot()
        .notifications.some((n) => n.userId === 'u-admin' && n.ticketId === ticket.id && !n.read),
    ).toBe(true);
  });
  it('rejects access to another employee ticket and unauthorized replies', () => {
    const ticket = store.getSnapshot().tickets.find((t) => t.requesterId === 'u-noah')!;
    expect(() => store.reply(ticket.id, 'u-employee', 'Hello')).toThrow();
    const own = store.createTicket(input, 'u-employee');
    expect(() => store.reply(own.id, 'u-agent', 'Hello')).toThrow();
  });
  it('marks only the selected user notifications as read', () => {
    store.markRead('u-employee');
    expect(
      store
        .getSnapshot()
        .notifications.filter((n) => n.userId === 'u-employee')
        .every((n) => n.read),
    ).toBe(true);
    expect(store.getSnapshot().notifications.some((n) => n.userId === 'u-admin' && !n.read)).toBe(
      true,
    );
  });
  it('falls back safely from corrupt storage and provides a warning on write failure', () => {
    expect(restoreDemo('{invalid')).toEqual(createSeed());
    expect(restoreDemo('{"version":2}')).toEqual(createSeed());
    const unavailable = createDemoStore(createSeed(), () => false);
    unavailable.createTicket(input, 'u-employee');
    expect(unavailable.getSnapshot().tickets).toHaveLength(49);
    expect(unavailable.getPersistenceWarning()).toContain('unavailable');
  });
  it('resets supported data and preferences to the deterministic seed', () => {
    store.createTicket(input, 'u-employee');
    store.saveProfile('u-employee', 'New Name', 'Engineering');
    store.savePreferences('u-employee', { email: false, desktop: true, digest: false });
    store.reset();
    expect(store.getSnapshot()).toEqual(createSeed());
  });
});
describe('ticket filtering and role scoping', () => {
  const { tickets, users } = createSeed();
  it('combines subject search, status, priority, and category', () => {
    const result = filterTickets(tickets, {
      search: 'printer',
      status: 'Open',
      priority: 'High',
      category: 'Hardware',
    });
    expect(result.length).toBeGreaterThan(0);
    expect(
      result.every(
        (t) =>
          t.subject.includes('printer') &&
          t.status === 'Open' &&
          t.priority === 'High' &&
          t.category === 'Hardware',
      ),
    ).toBe(true);
  });
  it('finds a ticket by ID and handles no results', () => {
    expect(filterTickets(tickets, { search: ' rd-1048 ' })).toHaveLength(1);
    expect(filterTickets(tickets, { search: 'no-such-ticket' })).toHaveLength(0);
  });
  it('sorts without mutating source order', () => {
    const ids = tickets.map((t) => t.id);
    const sorted = filterTickets(tickets, { sort: 'oldest' });
    expect(sorted[0]?.id).toBe('RD-1001');
    expect(tickets.map((t) => t.id)).toEqual(ids);
  });
  it('scopes employee and agent personal queues', () => {
    const employee = users.find((u) => u.id === 'u-employee')!;
    const agent = users.find((u) => u.id === 'u-agent')!;
    expect(visibleTickets(employee, tickets).every((t) => t.requesterId === employee.id)).toBe(
      true,
    );
    expect(visibleTickets(agent, tickets, true).every((t) => t.assigneeId === agent.id)).toBe(true);
    expect(
      canViewTicket(
        employee,
        tickets.find((t) => t.requesterId === 'u-noah')!,
      ),
    ).toBe(false);
    expect(
      canManageTicket(
        agent,
        tickets.find((t) => t.assigneeId === agent.id)!,
      ),
    ).toBe(true);
  });
});
