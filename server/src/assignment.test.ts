import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { lifecycleTestDatabase } from './test/local-postgres.js';
import { createApp } from './app.js';
import { activity, categories, escalations, tickets, users } from './db/schema.js';

let fixture: Awaited<ReturnType<typeof lifecycleTestDatabase>>;
let app: ReturnType<typeof createApp>;
type Client = { http: ReturnType<typeof request.agent>; csrf: string; id: string };
let admin: Client, agent: Client, employee: Client, otherAgent: Client;
let secondAgent: string, inactiveAgent: string, suspendedAgent: string, ticketId: string;
const origin = 'http://127.0.0.1:5173';
const reason = 'Transfer to the specialist covering this support request.';
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
const assign = (c: Client, assignedAgentId: string | null, extra = {}) =>
  c.http
    .patch(`/api/tickets/${ticketId}/assign`)
    .set('Origin', origin)
    .set('X-CSRF-Token', c.csrf)
    .send({ assignedAgentId, ...extra });
beforeAll(async () => {
  fixture = await lifecycleTestDatabase();
  app = createApp(fixture.db, fixture.config);
  admin = await login('admin@resolvedesk.example', fixture.secrets.SEED_ADMIN_PASSWORD);
  agent = await login('agent@resolvedesk.example', fixture.secrets.SEED_AGENT_PASSWORD);
  employee = await login('employee@resolvedesk.example', fixture.secrets.SEED_EMPLOYEE_PASSWORD);
  const ids: string[] = [];
  const [agentRecord] = await fixture.db.select().from(users).where(eq(users.id, agent.id));
  for (const accountStatus of ['active', 'inactive', 'suspended'] as const) {
    const [u] = await fixture.db
      .insert(users)
      .values({
        fullName: `Assignment ${accountStatus}`,
        email: `${randomUUID()}@example.com`,
        role: 'agent',
        accountStatus,
        passwordHash: agentRecord!.passwordHash,
      })
      .returning();
    ids.push(u!.id);
    if (accountStatus === 'active')
      otherAgent = await login(u!.email, fixture.secrets.SEED_AGENT_PASSWORD);
  }
  [secondAgent, inactiveAgent, suspendedAgent] = ids as [string, string, string];
}, 60000);
beforeEach(async () => {
  const categoryId = (await fixture.db.select().from(categories))[0]!.id;
  const [t] = await fixture.db
    .insert(tickets)
    .values({
      subject: 'Assignment verification',
      description: 'Investigate the reported network connectivity problem.',
      requesterId: employee.id,
      categoryId,
    })
    .returning();
  ticketId = t!.id;
});
afterAll(async () => {
  await fixture?.engine.close();
});

describe('assignment and reassignment', () => {
  it('assigns and reassigns with audit history while preserving lifecycle and ownership', async () => {
    const initial = await assign(admin, agent.id);
    expect(initial.status).toBe(200);
    const before = initial.body.data;
    const r = await assign(admin, secondAgent, { expectedVersion: 1, reason });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      requesterId: before.requesterId,
      createdAt: before.createdAt,
      status: before.status,
      lifecycleVersion: before.lifecycleVersion,
      resolvedAt: null,
      assignmentVersion: 2,
    });
    const audit = await fixture.db
      .select()
      .from(activity)
      .where(and(eq(activity.ticketId, ticketId), eq(activity.action, 'Ticket reassigned')));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: admin.id,
      oldValue: agent.id,
      newValue: secondAgent,
      explanation: reason,
    });
    expect((await agent.http.get(`/api/tickets/${ticketId}`)).status).toBe(404);
    expect((await otherAgent.http.get(`/api/tickets/${ticketId}`)).status).toBe(200);
    const history = await admin.http.get(`/api/tickets/${ticketId}/activity`);
    expect(history.body.data.at(-1)).toMatchObject({
      previousAgentName: 'George',
      nextAgentName: 'Assignment active',
    });
    const ownHistory = await employee.http.get(`/api/tickets/${ticketId}/activity`);
    expect(
      ownHistory.body.data.some((a: { explanation: string }) => a.explanation === reason),
    ).toBe(false);
  });
  it('rejects employee and agent assignment and unauthenticated access', async () => {
    for (const c of [employee, agent]) expect((await assign(c, secondAgent)).status).toBe(403);
    expect(
      (
        await request(app)
          .patch(`/api/tickets/${ticketId}/assign`)
          .send({ assignedAgentId: agent.id })
      ).status,
    ).toBe(401);
  });
  it('rejects unknown, employee, inactive, suspended and malformed assignees', async () => {
    for (const id of [randomUUID(), employee.id, inactiveAgent, suspendedAgent, 'invalid'])
      expect((await assign(admin, id)).status).toBe(400);
  });
  it('requires a reason, rejects duplicate and stale changes, and audits unassignment', async () => {
    expect((await assign(admin, null)).status).toBe(409);
    await assign(admin, agent.id);
    expect((await assign(admin, agent.id, { expectedVersion: 1, reason })).status).toBe(409);
    expect((await assign(admin, secondAgent, { expectedVersion: 1 })).status).toBe(400);
    expect((await assign(admin, secondAgent, { expectedVersion: 1, reason: 'short' })).status).toBe(
      400,
    );
    expect((await assign(admin, secondAgent, { reason })).status).toBe(409);
    expect((await assign(admin, null, { expectedVersion: 1, reason })).status).toBe(200);
    const q = await admin.http.get('/api/tickets?unassigned=true&limit=100');
    expect(q.body.data.items.some((t: { id: string }) => t.id === ticketId)).toBe(true);
  });
  it('allows only one concurrent assignment to win', async () => {
    const responses = await Promise.all([assign(admin, agent.id), assign(admin, secondAgent)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await fixture.db.select().from(activity).where(eq(activity.ticketId, ticketId)),
    ).toHaveLength(1);
  });
  it('blocks resolved and closed reassignment without changing resolution metadata', async () => {
    await assign(admin, agent.id);
    for (const status of ['resolved', 'closed'] as const) {
      await fixture.db
        .update(tickets)
        .set({
          status,
          resolvedAt: new Date(),
          closedAt: status === 'closed' ? new Date() : null,
          resolvedBy: agent.id,
          resolutionSummary: 'Verified the fix and restored network connectivity.',
        })
        .where(eq(tickets.id, ticketId));
      const [before] = await fixture.db.select().from(tickets).where(eq(tickets.id, ticketId));
      expect((await assign(admin, secondAgent, { expectedVersion: 1, reason })).status).toBe(409);
      expect((await fixture.db.select().from(tickets).where(eq(tickets.id, ticketId)))[0]).toEqual(
        before,
      );
    }
  });
});

const escalate = (c: Client, body: object = { reason }) =>
  c.http
    .post(`/api/tickets/${ticketId}/escalations`)
    .set('Origin', origin)
    .set('X-CSRF-Token', c.csrf)
    .send(body);
const manage = (c: Client, id: string, action: string, expectedStatus = 'open') =>
  c.http
    .patch(`/api/escalations/${id}/${action}`)
    .set('Origin', origin)
    .set('X-CSRF-Token', c.csrf)
    .send({ expectedStatus });
async function requestedEscalation() {
  expect((await assign(admin, agent.id)).status).toBe(200);
  const r = await escalate(agent);
  expect(r.status).toBe(201);
  return r.body.data.id as string;
}
describe('escalation workflow', () => {
  it('requests, acknowledges and resolves escalation without altering ticket lifecycle', async () => {
    const id = await requestedEscalation();
    const [before] = await fixture.db.select().from(tickets).where(eq(tickets.id, ticketId));
    const acknowledged = await manage(admin, id, 'acknowledge');
    expect(acknowledged.status).toBe(200);
    expect(acknowledged.body.data).toMatchObject({
      status: 'acknowledged',
      acknowledgedBy: admin.id,
    });
    expect((await manage(admin, id, 'resolve')).status).toBe(409);
    const resolved = await manage(admin, id, 'resolve', 'acknowledged');
    expect(resolved.status).toBe(200);
    expect(resolved.body.data).toMatchObject({
      status: 'resolved',
      requestedBy: agent.id,
      resolvedBy: admin.id,
      acknowledgedBy: admin.id,
    });
    expect(resolved.body.data.resolvedAt).toBeTruthy();
    expect((await fixture.db.select().from(tickets).where(eq(tickets.id, ticketId)))[0]).toEqual(
      before,
    );
    const history = await agent.http.get(`/api/tickets/${ticketId}/escalations?state=all`);
    expect(history.body.data.items[0]).toMatchObject({
      status: 'resolved',
      reason,
      requestedByName: 'George',
      acknowledgedByName: 'Jayr',
      resolvedByName: 'Jayr',
    });
    expect((await escalate(agent)).status).toBe(201);
    expect(
      (await agent.http.get(`/api/tickets/${ticketId}/escalations?state=all&limit=1`)).body.data
        .total,
    ).toBe(2);
  });
  it('requires reasons and enforces roles and assigned-only access', async () => {
    await assign(admin, agent.id);
    for (const body of [{}, { reason: 'short' }, { reason, status: 'resolved' }])
      expect((await escalate(agent, body)).status).toBe(400);
    for (const c of [admin, employee]) expect((await escalate(c)).status).toBe(403);
    expect((await escalate(otherAgent)).status).toBe(404);
    const r = await escalate(agent);
    for (const c of [agent, employee, otherAgent]) {
      expect((await c.http.get('/api/escalations')).status).toBe(403);
      expect((await manage(c, r.body.data.id, 'resolve')).status).toBe(403);
    }
    expect((await employee.http.get(`/api/tickets/${ticketId}/escalations`)).status).toBe(403);
    expect((await otherAgent.http.get(`/api/tickets/${ticketId}/escalations`)).status).toBe(404);
    const history = await employee.http.get(`/api/tickets/${ticketId}/activity`);
    expect(
      history.body.data.some((a: { action: string }) => a.action.startsWith('Escalation')),
    ).toBe(false);
  });
  it('prevents duplicate active requests in application and database, including races', async () => {
    await assign(admin, agent.id);
    const responses = await Promise.all([escalate(agent), escalate(agent)]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const id = responses.find((r) => r.status === 201)!.body.data.id;
    await expect(
      fixture.db.insert(escalations).values({ ticketId, requestedBy: agent.id, reason }),
    ).rejects.toThrow();
    await manage(admin, id, 'acknowledge');
    expect((await escalate(agent)).status).toBe(409);
    expect(
      await fixture.db
        .select()
        .from(activity)
        .where(and(eq(activity.ticketId, ticketId), eq(activity.action, 'Escalation requested'))),
    ).toHaveLength(1);
  });
  it('serializes administrator actions and does not duplicate audit events', async () => {
    const id = await requestedEscalation();
    const responses = await Promise.all([
      manage(admin, id, 'acknowledge'),
      manage(admin, id, 'acknowledge'),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await fixture.db
        .select()
        .from(activity)
        .where(
          and(eq(activity.ticketId, ticketId), eq(activity.action, 'Escalation acknowledged')),
        ),
    ).toHaveLength(1);
    expect((await manage(admin, randomUUID(), 'resolve')).status).toBe(404);
  });
  it('preserves escalation history across reassignment and changes agent access immediately', async () => {
    const id = await requestedEscalation();
    await assign(admin, secondAgent, { expectedVersion: 1, reason });
    expect((await agent.http.get(`/api/tickets/${ticketId}/escalations`)).status).toBe(404);
    expect((await escalate(agent)).status).toBe(404);
    const current = await otherAgent.http.get(`/api/tickets/${ticketId}/escalations`);
    expect(current.body.data.items[0].id).toBe(id);
    const queue = await admin.http.get('/api/escalations?limit=100');
    expect(queue.body.data.items.find((e: { id: string }) => e.id === id)).toMatchObject({
      assigneeName: 'Assignment active',
      ticketStatus: 'open',
    });
  });
  it('blocks new escalation on resolved tickets but permits handling an existing escalation', async () => {
    const id = await requestedEscalation();
    await fixture.db
      .update(tickets)
      .set({ status: 'resolved', resolvedAt: new Date() })
      .where(eq(tickets.id, ticketId));
    expect((await escalate(agent)).status).toBe(409);
    expect((await manage(admin, id, 'resolve')).status).toBe(200);
    expect((await agent.http.get(`/api/tickets/${ticketId}`)).body.data.status).toBe('resolved');
  });
});

describe('agent workload counts', () => {
  const workload = async () => {
    const r = await admin.http.get('/api/users/workloads?limit=100');
    expect(r.status).toBe(200);
    return r.body.data.items as {
      id: string;
      total: number;
      open: number;
      inProgress: number;
      pending: number;
      resolved: number;
      closed: number;
      department: string | null;
    }[];
  };
  it('counts all five statuses distinctly and includes eligible agents with zero tickets', async () => {
    const [empty] = await fixture.db
      .insert(users)
      .values({
        fullName: 'Zero workload agent',
        email: `${randomUUID()}@example.com`,
        role: 'agent',
        accountStatus: 'active',
      })
      .returning();
    const baseline = (await workload()).find((a) => a.id === secondAgent)!;
    const categoryId = (await fixture.db.select().from(categories))[0]!.id;
    for (const status of ['open', 'in_progress', 'pending', 'resolved', 'closed'] as const)
      await fixture.db.insert(tickets).values({
        subject: 'Workload status verification',
        description: 'Verify status counts using persisted ticket rows.',
        categoryId,
        requesterId: employee.id,
        assignedAgentId: secondAgent,
        status,
        resolvedAt: ['resolved', 'closed'].includes(status) ? new Date() : null,
        closedAt: status === 'closed' ? new Date() : null,
      });
    const rows = await workload();
    const after = rows.find((a) => a.id === secondAgent)!;
    expect(after.total - baseline.total).toBe(5);
    for (const key of ['open', 'inProgress', 'pending', 'resolved', 'closed'] as const)
      expect(after[key] - baseline[key]).toBe(1);
    expect(after.total).toBe(
      after.open + after.inProgress + after.pending + after.resolved + after.closed,
    );
    expect(rows.find((a) => a.id === empty!.id)?.total).toBe(0);
    expect(rows.find((a) => a.id === agent.id)?.department).toBe('Human Resources');
    for (const id of [inactiveAgent, suspendedAgent, employee.id, admin.id])
      expect(rows.some((a) => a.id === id)).toBe(false);
  });
  it('moves one unit of workload between agents on reassignment', async () => {
    await assign(admin, agent.id);
    const before = await workload();
    expect((await assign(admin, secondAgent, { expectedVersion: 1, reason })).status).toBe(200);
    const after = await workload();
    expect(after.find((a) => a.id === agent.id)!.open).toBe(
      before.find((a) => a.id === agent.id)!.open - 1,
    );
    expect(after.find((a) => a.id === secondAgent)!.open).toBe(
      before.find((a) => a.id === secondAgent)!.open + 1,
    );
  });
  it('restricts workload visibility and supports pagination and search', async () => {
    for (const c of [agent, employee])
      expect((await c.http.get('/api/users/workloads')).status).toBe(403);
    expect((await request(app).get('/api/users/workloads')).status).toBe(401);
    const result = await admin.http.get('/api/users/workloads?search=George&limit=1');
    expect(result.body.data).toMatchObject({ total: 1, page: 1, limit: 1 });
    expect(result.body.data.items[0].id).toBe(agent.id);
    expect((await admin.http.get('/api/users/workloads?limit=1000')).status).toBe(400);
  });
});
