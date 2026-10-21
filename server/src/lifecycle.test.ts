import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID, randomBytes } from 'node:crypto';
import { eq, and, sql } from 'drizzle-orm';
import { lifecycleTestDatabase } from './test/local-postgres.js';
import { createApp } from './app.js';
import { activity, categories, tickets, users, type Actor } from './db/schema.js';
import { lifecycleService } from './services/lifecycle.js';
import { hashPassword } from './services/auth.js';

let fixture: Awaited<ReturnType<typeof lifecycleTestDatabase>>;
let app: ReturnType<typeof createApp>;
type Client = { http: ReturnType<typeof request.agent>; csrf: string; id: string };
let admin: Client, agent: Client, employee: Client, outsider: Client, otherAgent: Client;
let adminActor: Actor;
let ticketId: string, categoryId: string;
const origin = 'http://127.0.0.1:5173';
const summary = 'Replaced the faulty network adapter and verified stable connectivity.';
const reason = 'The network connection still drops during video calls.';
async function login(email: string, password: string): Promise<Client> {
  const http = request.agent(app);
  const pre = await http.get('/api/auth/csrf');
  const r = await http
    .post('/api/auth/login')
    .set('Origin', origin)
    .set('X-CSRF-Token', pre.body.data.csrfToken)
    .send({ email, password });
  expect(r.status).toBe(200);
  return { http, csrf: r.body.data.csrfToken, id: r.body.data.user.id };
}
const mutate = (c: Client, suffix: string, body: object) =>
  c.http
    .patch(`/api/tickets/${ticketId}${suffix}`)
    .set('Origin', origin)
    .set('X-CSRF-Token', c.csrf)
    .send(body);
async function state() {
  const r = await employee.http.get('/api/tickets/' + ticketId);
  expect(r.status).toBe(200);
  return r.body.data;
}
async function move(status: string) {
  const current = await state();
  const r = await mutate(agent, '/status', { status, expectedVersion: current.lifecycleVersion });
  expect(r.status).toBe(200);
  return r.body.data;
}
async function resolve() {
  await move('in_progress');
  const current = await state();
  const r = await mutate(agent, '/resolve', { summary, expectedVersion: current.lifecycleVersion });
  expect(r.status).toBe(200);
  return r.body.data;
}
beforeAll(async () => {
  fixture = await lifecycleTestDatabase();
  app = createApp(fixture.db, fixture.config);
  admin = await login('admin@resolvedesk.example', fixture.secrets.SEED_ADMIN_PASSWORD);
  agent = await login('agent@resolvedesk.example', fixture.secrets.SEED_AGENT_PASSWORD);
  employee = await login('employee@resolvedesk.example', fixture.secrets.SEED_EMPLOYEE_PASSWORD);
  const extraSecret = randomBytes(24).toString('hex');
  for (const role of ['employee', 'agent'] as const)
    await fixture.db.insert(users).values({
      fullName: 'Other ' + role,
      email: `other-${role}@example.com`,
      role,
      accountStatus: 'active',
      passwordHash: await hashPassword(extraSecret),
    });
  outsider = await login('other-employee@example.com', extraSecret);
  otherAgent = await login('other-agent@example.com', extraSecret);
  [adminActor] = (await fixture.db.select().from(users).where(eq(users.id, admin.id))) as [Actor];
  categoryId = (await fixture.db.select().from(categories))[0]!.id;
}, 60000);
beforeEach(async () => {
  const r = await employee.http
    .post('/api/tickets')
    .set('Origin', origin)
    .set('X-CSRF-Token', employee.csrf)
    .send({
      subject: 'Lifecycle verification ' + randomUUID(),
      description: 'A network issue requiring investigation and resolution.',
      categoryId,
    });
  expect(r.status).toBe(201);
  ticketId = r.body.data.id;
  expect((await mutate(admin, '/assign', { assignedAgentId: agent.id })).status).toBe(200);
});
afterAll(async () => {
  await fixture?.engine.close();
});

describe('advanced lifecycle persistence and authorization', () => {
  it('resolves, reopens, resolves again, and confirms while preserving every attempt', async () => {
    const original = await state();
    const first = await resolve();
    expect(first.resolvedBy).toBe(agent.id);
    expect(first.resolutionSummary).toBe(summary);
    expect(first.resolvedAt).toBeTruthy();
    expect(first.closedAt).toBeNull();
    const reopened = await mutate(employee, '/reopen', {
      expectedVersion: first.lifecycleVersion,
      reason,
    });
    expect(reopened.status).toBe(200);
    expect(reopened.body.data.status).toBe('open');
    expect(reopened.body.data.createdAt).toBe(original.createdAt);
    expect(reopened.body.data.resolvedAt).toBeNull();
    expect(reopened.body.data.resolutionSummary).toBeNull();
    const second = await resolve();
    const confirmed = await mutate(employee, '/confirm-resolution', {
      expectedVersion: second.lifecycleVersion,
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe('closed');
    expect(confirmed.body.data.closedBy).toBe(employee.id);
    expect(confirmed.body.data.closedAt).toBeTruthy();
    expect(confirmed.body.data.resolvedAt).toBe(second.resolvedAt);
    const history = (await employee.http.get(`/api/tickets/${ticketId}/activity`)).body.data;
    expect(
      history.filter((a: { action: string }) => a.action === 'Resolution submitted'),
    ).toHaveLength(2);
    expect(history.filter((a: { explanation: string }) => a.explanation === summary)).toHaveLength(
      2,
    );
    expect(history.some((a: { explanation: string }) => a.explanation === reason)).toBe(true);
    const reloaded = await state();
    expect(reloaded.resolver.name).toBe('George');
    expect(reloaded.closer.name).toBe('Mon');
  });
  it('allows pending resolution and requires meaningful notes and strict inputs', async () => {
    await move('pending');
    for (const summary of [undefined, '', '  ', 'Too short'])
      expect((await mutate(agent, '/resolve', { expectedVersion: 1, summary })).status).toBe(400);
    expect(
      (await mutate(agent, '/resolve', { summary, expectedVersion: 1, resolvedBy: admin.id }))
        .status,
    ).toBe(400);
    expect((await mutate(agent, '/resolve', { summary })).status).toBe(400);
    expect((await mutate(agent, '/resolve', { summary, expectedVersion: 1 })).status).toBe(200);
    for (const reason of [undefined, '', '  ', 'short'])
      expect((await mutate(employee, '/reopen', { expectedVersion: 2, reason })).status).toBe(400);
    expect((await state()).status).toBe('resolved');
  });
  it('rejects shortcuts and invalid transitions without audit writes', async () => {
    for (const status of ['resolved', 'closed', 'open'])
      expect((await mutate(agent, '/status', { status })).status).toBe(409);
    expect((await mutate(agent, '/resolve', { summary, expectedVersion: 0 })).status).toBe(409);
    expect((await mutate(employee, '/confirm-resolution', { expectedVersion: 0 })).status).toBe(
      409,
    );
    expect((await mutate(employee, '/reopen', { reason, expectedVersion: 0 })).status).toBe(409);
    expect((await state()).lifecycleVersion).toBe(0);
    const events = await fixture.db
      .select()
      .from(activity)
      .where(and(eq(activity.ticketId, ticketId), sql`${activity.lifecycleVersion} is not null`));
    expect(events).toHaveLength(0);
  });
  it('enforces requester ownership, assigned-agent scope, and authentication on every new action', async () => {
    const r = await resolve();
    for (const [suffix, body] of [
      ['/resolve', { summary, expectedVersion: r.lifecycleVersion }],
      ['/confirm-resolution', { expectedVersion: r.lifecycleVersion }],
      ['/close', { reason, expectedVersion: r.lifecycleVersion }],
      ['/reopen', { reason, expectedVersion: r.lifecycleVersion }],
    ] as const) {
      expect(
        (await request(app).patch(`/api/tickets/${ticketId}${suffix}`).send(body)).status,
      ).toBe(401);
      expect((await mutate(outsider, suffix, body)).status).toBe(404);
      expect((await mutate(otherAgent, suffix, body)).status).toBe(404);
    }
    expect(
      (await mutate(employee, '/resolve', { summary, expectedVersion: r.lifecycleVersion })).status,
    ).toBe(403);
    expect(
      (await mutate(agent, '/confirm-resolution', { expectedVersion: r.lifecycleVersion })).status,
    ).toBe(403);
    expect(
      (await mutate(agent, '/close', { reason, expectedVersion: r.lifecycleVersion })).status,
    ).toBe(403);
    expect(
      (
        await employee.http
          .patch(`/api/tickets/${ticketId}/reopen`)
          .send({ reason, expectedVersion: r.lifecycleVersion })
      ).status,
    ).toBe(403);
  });
  it('reserves closed-ticket reopening for administrators with a recorded reason', async () => {
    const r = await resolve();
    expect((await mutate(admin, '/close', { expectedVersion: r.lifecycleVersion })).status).toBe(
      400,
    );
    const closed = await mutate(admin, '/close', {
      reason: 'Requester confirmed the repair by phone.',
      expectedVersion: r.lifecycleVersion,
    });
    expect(closed.status).toBe(200);
    expect(closed.body.data.closedBy).toBe(admin.id);
    for (const c of [employee, agent])
      expect(
        (await mutate(c, '/reopen', { reason, expectedVersion: closed.body.data.lifecycleVersion }))
          .status,
      ).toBe(403);
    expect((await mutate(admin, '/status', { status: 'in_progress' })).status).toBe(409);
    expect(
      (
        await mutate(admin, '/reopen', {
          reason,
          expectedVersion: closed.body.data.lifecycleVersion,
        })
      ).status,
    ).toBe(200);
    const history = (await employee.http.get(`/api/tickets/${ticketId}/activity`)).body.data;
    expect(
      history.some(
        (a: { action: string; explanation: string }) =>
          a.action === 'Closed ticket reopened by administrator' && a.explanation === reason,
      ),
    ).toBe(true);
  });
  it('allows assigned support to resume resolved investigation with a reason', async () => {
    const r = await resolve();
    expect(
      (await mutate(agent, '/reopen', { reason, expectedVersion: r.lifecycleVersion })).status,
    ).toBe(200);
    expect((await state()).status).toBe('open');
    expect((await move('in_progress')).status).toBe('in_progress');
  });
  it('rejects duplicate confirmations and duplicate reopening without extra history', async () => {
    const r = await resolve();
    const results = await Promise.all([
      mutate(employee, '/reopen', { reason, expectedVersion: r.lifecycleVersion }),
      mutate(employee, '/reopen', { reason, expectedVersion: r.lifecycleVersion }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const again = await resolve();
    const confirmed = await Promise.all([
      mutate(employee, '/confirm-resolution', { expectedVersion: again.lifecycleVersion }),
      mutate(employee, '/confirm-resolution', { expectedVersion: again.lifecycleVersion }),
    ]);
    expect(confirmed.map((r) => r.status).sort()).toEqual([200, 409]);
    const history = (await employee.http.get(`/api/tickets/${ticketId}/activity`)).body.data;
    expect(history.filter((a: { action: string }) => a.action === 'Ticket reopened')).toHaveLength(
      1,
    );
    expect(
      history.filter(
        (a: { action: string }) => a.action === 'Resolution confirmed and ticket closed',
      ),
    ).toHaveLength(1);
  });
  it('rejects an old operation after a later resolution cycle', async () => {
    const old = await resolve();
    await mutate(employee, '/reopen', { reason, expectedVersion: old.lifecycleVersion });
    await resolve();
    expect(
      (await mutate(employee, '/confirm-resolution', { expectedVersion: old.lifecycleVersion }))
        .status,
    ).toBe(409);
    expect((await state()).status).toBe('resolved');
  });
  it('serializes competing resolution and status requests into one change', async () => {
    const r = await move('in_progress');
    const results = await Promise.all([
      mutate(agent, '/resolve', { summary, expectedVersion: r.lifecycleVersion }),
      mutate(admin, '/status', { status: 'pending', expectedVersion: r.lifecycleVersion }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const current = await state();
    expect(current.lifecycleVersion).toBe(2);
    const events = await fixture.db
      .select()
      .from(activity)
      .where(and(eq(activity.ticketId, ticketId), eq(activity.lifecycleVersion, 2)));
    expect(events).toHaveLength(1);
    expect(events[0]!.newValue).toBe(current.status);
  });
  it.runIf(!!process.env.TEST_DATABASE_URL)(
    'uses separate PostgreSQL connections for real row-lock concurrency',
    async () => {
      const one = await fixture.pool!.connect(),
        two = await fixture.pool!.connect();
      try {
        expect((await one.query('SELECT pg_backend_pid() AS id')).rows[0].id).not.toBe(
          (await two.query('SELECT pg_backend_pid() AS id')).rows[0].id,
        );
        await one.query('BEGIN');
        await one.query('SELECT id FROM tickets WHERE id=$1 FOR UPDATE', [ticketId]);
        const requests = Promise.all([
          mutate(agent, '/status', { status: 'in_progress', expectedVersion: 0 }),
          mutate(admin, '/status', { status: 'pending', expectedVersion: 0 }),
        ]);
        await new Promise((resolve) => setTimeout(resolve, 100));
        await one.query('COMMIT');
        expect((await requests).map((r) => r.status).sort()).toEqual([200, 409]);
      } finally {
        await one.query('ROLLBACK');
        one.release();
        two.release();
      }
    },
  );
  it('rolls back the ticket update when its audit insert fails', async () => {
    const before = (await fixture.db.select().from(tickets).where(eq(tickets.id, ticketId)))[0];
    const events = await fixture.db.select().from(activity).where(eq(activity.ticketId, ticketId));
    await expect(
      lifecycleService(fixture.db).status({ ...adminActor, id: randomUUID() }, ticketId, {
        status: 'in_progress',
        expectedVersion: 0,
      }),
    ).rejects.toThrow();
    expect((await fixture.db.select().from(tickets).where(eq(tickets.id, ticketId)))[0]).toEqual(
      before,
    );
    expect(await fixture.db.select().from(activity).where(eq(activity.ticketId, ticketId))).toEqual(
      events,
    );
  });
  it('keeps private notes private and current analytics accurate after reopening', async () => {
    await agent.http
      .post(`/api/tickets/${ticketId}/comments`)
      .set('Origin', origin)
      .set('X-CSRF-Token', agent.csrf)
      .send({ message: 'Private investigation detail', isInternal: true });
    const r = await resolve();
    await mutate(employee, '/reopen', { reason, expectedVersion: r.lifecycleVersion });
    const history = await employee.http.get(`/api/tickets/${ticketId}/activity`);
    expect(JSON.stringify(history.body)).not.toContain('Internal note');
    const comments = await employee.http.get(`/api/tickets/${ticketId}/comments`);
    expect(JSON.stringify(comments.body)).not.toContain('Private investigation');
    const dashboard = (await employee.http.get('/api/analytics/dashboard')).body.data;
    const rows = await fixture.db
      .select()
      .from(tickets)
      .where(eq(tickets.requesterId, employee.id));
    for (const status of ['open', 'in_progress', 'pending', 'resolved', 'closed'])
      expect(dashboard.status.find((r: { name: string }) => r.name === status)?.value ?? 0).toBe(
        rows.filter((r) => r.status === status).length,
      );
    const queue = await agent.http.get('/api/tickets?status=open');
    expect(queue.body.data.items.some((r: { id: string }) => r.id === ticketId)).toBe(true);
  });
});
