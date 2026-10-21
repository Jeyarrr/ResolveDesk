import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { createApp } from './app.js';
import { testDatabase } from './test/database.js';
import { activity, categories, comments, sessions, tickets, users } from './db/schema.js';
import { hashPassword } from './services/auth.js';
let fixture: Awaited<ReturnType<typeof testDatabase>>;
let app: ReturnType<typeof createApp>;
const origin = 'http://127.0.0.1:5173';
type Client = { agent: ReturnType<typeof request.agent>; csrf: string; id: string };
let admin: Client, agent: Client, employee: Client, outsider: Client;
let ticketId: string, categoryId: string;
const otherPassword = randomBytes(24).toString('hex');
async function login(role: 'admin' | 'agent' | 'employee' | 'other', password?: string) {
  const a = request.agent(app);
  const pre = await a.get('/api/auth/csrf');
  const secret =
    password ??
    (role === 'other'
      ? otherPassword
      : fixture.secrets[
          ('SEED_' + role.toUpperCase() + '_PASSWORD') as keyof typeof fixture.secrets
        ]);
  const response = await a
    .post('/api/auth/login')
    .set('Origin', origin)
    .set('X-CSRF-Token', pre.body.data.csrfToken)
    .send({ email: role + '@resolvedesk.example', password: secret, remember: true });
  return {
    agent: a,
    csrf: response.body.data?.csrfToken ?? '',
    id: response.body.data?.user.id ?? '',
    response,
  };
}
function mutate(c: Client, path: string, body: object, method: 'post' | 'patch' = 'post') {
  return c.agent[method]('/api' + path)
    .set('Origin', origin)
    .set('X-CSRF-Token', c.csrf)
    .send(body);
}
beforeAll(async () => {
  fixture = await testDatabase();
  app = createApp(fixture.db, fixture.config);
  await fixture.db.insert(users).values({
    fullName: 'Other Employee',
    email: 'other@resolvedesk.example',
    role: 'employee',
    accountStatus: 'active',
    passwordHash: await hashPassword(otherPassword),
  });
  admin = await login('admin');
  agent = await login('agent');
  employee = await login('employee');
  outsider = await login('other');
  const [category] = await fixture.db.select().from(categories);
  categoryId = category!.id;
}, 60000);
afterAll(async () => {
  await fixture?.engine.close();
});
describe('authentication and request security', () => {
  it('rotates an existing session and rejects its old token', async () => {
    const c = await login('employee');
    const cookies = c.response.headers['set-cookie'] as unknown as string[];
    const oldCookie = cookies.find((value) => value.startsWith('resolvedesk='))!.split(';')[0]!;
    const pre = await c.agent.get('/api/auth/csrf');
    const renewed = await c.agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', pre.body.data.csrfToken)
      .send({
        email: 'employee@resolvedesk.example',
        password: fixture.secrets.SEED_EMPLOYEE_PASSWORD,
      });
    expect(renewed.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Cookie', oldCookie)).status).toBe(401);
    expect((await c.agent.get('/api/auth/me')).status).toBe(200);
  });
  it('sets secure host-only production cookies with explicit SameSite', async () => {
    const production = createApp(fixture.db, {
      ...fixture.config,
      NODE_ENV: 'production',
      CLIENT_ORIGIN: 'https://app.example.com',
      COOKIE_SAME_SITE: 'none',
    });
    const pre = await request(production).get('/api/auth/csrf');
    const cookies = pre.headers['set-cookie'] as unknown as string[];
    const result = await request(production)
      .post('/api/auth/login')
      .set('Origin', 'https://app.example.com')
      .set('Cookie', cookies[0]!.split(';')[0]!)
      .set('X-CSRF-Token', pre.body.data.csrfToken)
      .send({
        email: 'employee@resolvedesk.example',
        password: fixture.secrets.SEED_EMPLOYEE_PASSWORD,
      });
    expect(result.status).toBe(200);
    const cookie = (result.headers['set-cookie'] as unknown as string[]).find((v) =>
      v.startsWith('__Host-resolvedesk='),
    )!;
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=None');
    expect(cookie).not.toContain('Domain=');
  });
  it('authenticates with safe profiles and protected cookies', async () => {
    const result = await login('employee');
    expect(result.response.status).toBe(200);
    expect(result.response.body.data.user.passwordHash).toBeUndefined();
    expect(String(result.response.headers['set-cookie'])).toMatch(/HttpOnly/);
    expect(String(result.response.headers['set-cookie'])).toMatch(/SameSite=Lax/);
    const [row] = await fixture.db.select().from(sessions).where(eq(sessions.userId, result.id));
    expect(row!.tokenHash).toHaveLength(64);
    expect((await result.agent.get('/api/auth/me')).status).toBe(200);
  });
  it('rejects invalid credentials with a generic error', async () => {
    const r = await login('employee', 'incorrect-password');
    expect(r.response.status).toBe(401);
    expect(r.response.body.error.message).toBe('Email or password is incorrect');
  });
  it('requires authentication and rejects CSRF attempts', async () => {
    expect((await request(app).get('/api/tickets')).status).toBe(401);
    expect((await employee.agent.post('/api/tickets').set('Origin', origin).send({})).status).toBe(
      403,
    );
    expect(
      (
        await employee.agent
          .post('/api/tickets')
          .set('Origin', 'https://evil.example')
          .set('X-CSRF-Token', employee.csrf)
          .send({})
      ).status,
    ).toBe(403);
    const r = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(r.headers['access-control-allow-origin']).toBe(origin);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });
  it('revokes logout sessions', async () => {
    const c = await login('employee');
    expect((await mutate(c, '/auth/logout', {})).status).toBe(200);
    expect((await c.agent.get('/api/auth/me')).status).toBe(401);
  });
  it('rejects expired sessions', async () => {
    const c = await login('other');
    await fixture.db
      .update(sessions)
      .set({ expiresAt: new Date(0) })
      .where(eq(sessions.userId, c.id));
    expect((await c.agent.get('/api/auth/me')).status).toBe(401);
    outsider = await login('other');
  });
  it('rejects suspended and inactive accounts and existing sessions', async () => {
    await fixture.db
      .update(users)
      .set({ accountStatus: 'suspended' })
      .where(eq(users.id, outsider.id));
    expect((await login('other')).response.status).toBe(401);
    expect((await outsider.agent.get('/api/auth/me')).status).toBe(401);
    await fixture.db
      .update(users)
      .set({ accountStatus: 'inactive' })
      .where(eq(users.id, outsider.id));
    expect((await login('other')).response.status).toBe(401);
    await fixture.db
      .update(users)
      .set({ accountStatus: 'active' })
      .where(eq(users.id, outsider.id));
    outsider = await login('other');
  });
});
describe('ticket lifecycle and object authorization', () => {
  it('creates a ticket and activity with server-owned requester', async () => {
    const r = await mutate(employee, '/tickets', {
      subject: 'Integration VPN issue',
      description: 'The VPN disconnects during video calls and blocks access.',
      categoryId,
      priority: 'high',
    });
    expect(r.status).toBe(201);
    ticketId = r.body.data.id;
    expect(r.body.data.requesterId).toBe(employee.id);
    const history = await employee.agent.get('/api/tickets/' + ticketId + '/activity');
    expect(history.body.data[0].action).toBe('Ticket created');
  });
  it('enforces employee ownership across all ticket endpoints', async () => {
    for (const suffix of ['', '/comments', '/activity'])
      expect((await outsider.agent.get('/api/tickets/' + ticketId + suffix)).status).toBe(404);
    expect(
      (await mutate(outsider, '/tickets/' + ticketId + '/comments', { message: 'Not my ticket' }))
        .status,
    ).toBe(404);
    const r = await outsider.agent.get('/api/tickets');
    expect(r.body.data.items.some((t: { id: string }) => t.id === ticketId)).toBe(false);
  });
  it('rejects mass assignment, invalid input, admin access and role escalation', async () => {
    expect(
      (
        await mutate(employee, '/tickets', {
          subject: 'Invalid ticket',
          description: 'Long enough description for a real request',
          categoryId,
          requesterId: admin.id,
        })
      ).status,
    ).toBe(400);
    expect((await mutate(employee, '/tickets', { subject: 'x' })).status).toBe(400);
    expect((await employee.agent.get('/api/users')).status).toBe(403);
    expect(
      (await mutate(employee, '/users/' + employee.id, { role: 'admin' }, 'patch')).status,
    ).toBe(403);
    expect(
      (
        await mutate(
          employee,
          '/tickets/' + ticketId + '/assign',
          { assignedAgentId: agent.id },
          'patch',
        )
      ).status,
    ).toBe(403);
  });
  it('restricts agents to assignments and rejects ineligible assignees', async () => {
    expect((await agent.agent.get('/api/tickets/' + ticketId)).status).toBe(404);
    expect(
      (
        await mutate(
          admin,
          '/tickets/' + ticketId + '/assign',
          { assignedAgentId: employee.id },
          'patch',
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await mutate(
          admin,
          '/tickets/' + ticketId + '/assign',
          { assignedAgentId: agent.id },
          'patch',
        )
      ).status,
    ).toBe(200);
    expect((await agent.agent.get('/api/tickets/' + ticketId)).status).toBe(200);
  });
  it('allows admin edits and filtering, rejects agent priority updates', async () => {
    expect(
      (
        await mutate(
          admin,
          '/tickets/' + ticketId,
          { priority: 'critical', subject: 'Updated integration request' },
          'patch',
        )
      ).status,
    ).toBe(200);
    expect((await mutate(agent, '/tickets/' + ticketId, { priority: 'low' }, 'patch')).status).toBe(
      403,
    );
    const list = await admin.agent.get('/api/tickets?search=Updated&priority=critical&limit=1');
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.total).toBe(1);
    expect((await admin.agent.get('/api/tickets?limit=1000')).status).toBe(400);
  });
  it('enforces transitions and consistent resolution timestamps', async () => {
    expect(
      (await mutate(agent, '/tickets/' + ticketId + '/status', { status: 'closed' }, 'patch'))
        .status,
    ).toBe(409);
    expect(
      (
        await mutate(
          employee,
          '/tickets/' + ticketId + '/status',
          { status: 'in_progress' },
          'patch',
        )
      ).status,
    ).toBe(403);
    for (const status of ['in_progress', 'resolved', 'closed', 'open']) {
      const r = await mutate(agent, '/tickets/' + ticketId + '/status', { status }, 'patch');
      expect(r.status).toBe(200);
      expect(Boolean(r.body.data.resolvedAt)).toBe(['resolved', 'closed'].includes(status));
      expect(Boolean(r.body.data.closedAt)).toBe(status === 'closed');
    }
  });
  it('persists comments and hides internal notes and their activities', async () => {
    expect(
      (
        await mutate(employee, '/tickets/' + ticketId + '/comments', {
          message: 'An employee reply',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await mutate(agent, '/tickets/' + ticketId + '/comments', {
          message: 'Private support investigation',
          isInternal: true,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await mutate(employee, '/tickets/' + ticketId + '/comments', {
          message: 'Attempt',
          isInternal: true,
        })
      ).status,
    ).toBe(403);
    const publicNotes = await employee.agent.get('/api/tickets/' + ticketId + '/comments');
    expect(publicNotes.body.data).toHaveLength(1);
    const staffNotes = await agent.agent.get('/api/tickets/' + ticketId + '/comments');
    expect(staffNotes.body.data).toHaveLength(2);
    const history = await employee.agent.get('/api/tickets/' + ticketId + '/activity');
    expect(JSON.stringify(history.body)).not.toContain('Internal note');
  });
  it('returns real scoped statistics', async () => {
    const r = await employee.agent.get('/api/analytics/dashboard');
    const [count] = await fixture.db
      .select({ n: sql<number>`count(*)::int` })
      .from(tickets)
      .where(eq(tickets.requesterId, employee.id));
    expect(r.body.data.total).toBe(count!.n);
    expect(r.body.data.sla).toBeNull();
    expect(
      r.body.data.recentActivity.every(
        (a: { action: string }) => a.action !== 'Internal note added',
      ),
    ).toBe(true);
  });
});
describe('administration and database integrity', () => {
  it('creates accounts without plaintext passwords and requires provisioning', async () => {
    const r = await mutate(admin, '/users', {
      fullName: 'New Colleague',
      email: 'NEW@resolvedesk.example',
      departmentId: null,
      role: 'employee',
      accountStatus: 'inactive',
    });
    expect(r.status).toBe(201);
    expect(r.body.data.email).toBe('new@resolvedesk.example');
    expect(r.body.data.passwordHash).toBeUndefined();
    expect(r.body.data.passwordReady).toBe(false);
    expect(
      (await mutate(admin, '/users/' + r.body.data.id, { accountStatus: 'active' }, 'patch'))
        .status,
    ).toBe(409);
    expect(
      (
        await mutate(admin, '/users', {
          fullName: 'Duplicate',
          email: 'new@resolvedesk.example',
          departmentId: null,
        })
      ).status,
    ).toBe(409);
  });
  it('protects the last active administrator and assigned agents', async () => {
    expect((await mutate(admin, '/users/' + admin.id, { role: 'employee' }, 'patch')).status).toBe(
      409,
    );
    expect(
      (await mutate(admin, '/users/' + admin.id, { accountStatus: 'suspended' }, 'patch')).status,
    ).toBe(409);
    expect(
      (await mutate(admin, '/users/' + agent.id, { accountStatus: 'inactive' }, 'patch')).status,
    ).toBe(409);
  });
  it('creates and archives references without deleting history', async () => {
    for (const path of ['/departments', '/ticket-categories']) {
      const r = await mutate(admin, path, {
        name: 'Integration reference',
        description: 'Test fixture',
      });
      expect(r.status).toBe(201);
      expect(
        (await mutate(admin, path + '/' + r.body.data.id, { active: false }, 'patch')).status,
      ).toBe(200);
      const list = await employee.agent.get('/api' + path);
      expect(list.body.data.some((v: { id: string }) => v.id === r.body.data.id)).toBe(false);
    }
  });
  it('enforces case-insensitive email uniqueness and foreign keys', async () => {
    await expect(
      fixture.db
        .insert(users)
        .values({ fullName: 'Duplicate', email: 'EMPLOYEE@resolvedesk.example' }),
    ).rejects.toThrow();
    await expect(
      fixture.db
        .insert(comments)
        .values({ ticketId: randomUUID(), authorId: employee.id, message: 'Orphan' }),
    ).rejects.toThrow();
    await expect(fixture.db.delete(users).where(eq(users.id, employee.id))).rejects.toThrow();
  });
  it('rolls back ticket creation when activity insertion fails', async () => {
    const subject = 'Must rollback';
    await expect(
      fixture.db.transaction(async (tx) => {
        const [t] = await tx
          .insert(tickets)
          .values({
            subject,
            description: 'Transaction rollback integrity test',
            categoryId,
            requesterId: employee.id,
          })
          .returning();
        await tx
          .insert(activity)
          .values({ ticketId: t!.id, actorId: randomUUID(), action: 'Invalid actor' });
      }),
    ).rejects.toThrow();
    expect(
      await fixture.db.select().from(tickets).where(eq(tickets.subject, subject)),
    ).toHaveLength(0);
  });
  it('keeps the last admin under concurrent account changes', async () => {
    const [second] = await fixture.db
      .insert(users)
      .values({
        fullName: 'Second Admin',
        email: 'second-admin@resolvedesk.example',
        role: 'admin',
        accountStatus: 'active',
        passwordHash: await hashPassword(randomBytes(24).toString('hex')),
      })
      .returning();
    const results = await Promise.all([
      mutate(admin, '/users/' + admin.id, { accountStatus: 'inactive' }, 'patch'),
      mutate(admin, '/users/' + second!.id, { accountStatus: 'inactive' }, 'patch'),
    ]);
    expect(results.filter((r) => r.status === 200).length).toBe(1);
    const active = await fixture.db
      .select()
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.accountStatus, 'active')));
    expect(active).toHaveLength(1);
  });
  it('rate limits login attempts', async () => {
    const a = request.agent(app);
    const pre = await a.get('/api/auth/csrf');
    let status = 0;
    for (let i = 0; i < 21; i++) {
      const r = await a
        .post('/api/auth/login')
        .set('Origin', origin)
        .set('X-CSRF-Token', pre.body.data.csrfToken)
        .send({ email: 'invalid', password: '' });
      status = r.status;
    }
    expect(status).toBe(429);
  });
});
it('reopens persisted PostgreSQL data and safely reapplies migrations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'resolvedesk-test-'));
  let local: Awaited<ReturnType<typeof testDatabase>> | undefined;
  if (!dir.startsWith(join(tmpdir(), 'resolvedesk-test-')))
    throw new Error('Unexpected test directory');
  try {
    local = await testDatabase(dir);
    const [row] = await local.db.select().from(tickets);
    const id = row!.id;
    await local.engine.close();
    local = await testDatabase(dir);
    expect(await local.db.select().from(tickets).where(eq(tickets.id, id))).toHaveLength(1);
  } finally {
    await local?.engine.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 60000);
