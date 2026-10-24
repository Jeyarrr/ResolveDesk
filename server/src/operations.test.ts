import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import { lifecycleTestDatabase } from './test/local-postgres.js';
import { createApp } from './app.js';
import { startOperations } from './realtime.js';
import { authService } from './services/auth.js';
import {
  addBusinessMinutes,
  businessMinutesBetween,
  calendarInput,
} from './services/business-time.js';
import { monitorSla, slaService, slaView, startSla } from './services/sla.js';
import { processEvents, notificationService } from './services/notifications.js';
import { recordOperation } from './services/operations.js';
import { reports, csvValue } from './services/reports.js';
import {
  categories,
  notifications,
  operationEvents,
  slaPolicies,
  tickets,
  ticketSlas,
  users,
  sessions,
  type Actor,
  type BusinessCalendar,
} from './db/schema.js';
let fixture: Awaited<ReturnType<typeof lifecycleTestDatabase>>,
  admin: Actor,
  agent: Actor,
  employee: Actor,
  category: string;
const calendar: BusinessCalendar = {
  timezone: 'Asia/Manila',
  startHour: 9,
  endHour: 18,
  weekdays: [1, 2, 3, 4, 5],
  holidays: [],
};
beforeAll(async () => {
  fixture = await lifecycleTestDatabase();
  const all = await fixture.db.select().from(users);
  admin = all.find((u) => u.role === 'admin')!;
  agent = all.find((u) => u.role === 'agent')!;
  employee = all.find((u) => u.role === 'employee')!;
  category = (await fixture.db.select().from(categories))[0]!.id;
}, 60000);
afterAll(async () => {
  await fixture?.engine.close();
});
async function make(
  priority: 'low' | 'medium' | 'high' | 'critical' = 'critical',
  at = new Date('2026-10-19T01:00:00Z'),
) {
  return fixture.db.transaction(async (tx) => {
    const [t] = await tx
      .insert(tickets)
      .values({
        subject: 'Phase four ' + randomUUID(),
        description: 'A real support request for operational tests.',
        categoryId: category,
        priority,
        requesterId: employee.id,
        assignedAgentId: agent.id,
        createdAt: at,
      })
      .returning();
    const sla = await startSla(tx, t!, at);
    return { ticket: t!, sla: sla! };
  });
}
async function event(
  ticketId: string,
  action: string,
  actorId = agent.id,
  at = new Date('2026-10-19T01:10:00Z'),
  internal = false,
) {
  return fixture.db.transaction((tx) =>
    recordOperation(tx, { ticketId, action, actorId, createdAt: at, isInternal: internal }),
  );
}
const slaFor = async (id: string) =>
  (await fixture.db.select().from(ticketSlas).where(eq(ticketSlas.id, id)))[0]!;
describe('business calendars and SLA lifecycle', () => {
  it('aggregates SLA dashboards across the complete authorized scope', async () => {
    const service = slaService(fixture.db);
    const before = await Promise.all([
      service.overview(admin),
      service.overview(agent),
      service.overview(employee),
    ]);
    const { ticket } = await make();
    const after = await Promise.all([
      service.overview(admin),
      service.overview(agent),
      service.overview(employee),
    ]);
    after.forEach((value, index) => expect(value.tracked).toBe(before[index]!.tracked + 1));
    expect(after[2]!.averageResponseMinutes).toBeNull();
    await fixture.db
      .update(tickets)
      .set({ requesterId: admin.id, assignedAgentId: null })
      .where(eq(tickets.id, ticket.id));
    expect((await service.overview(admin)).tracked).toBe(after[0]!.tracked);
    expect((await service.overview(agent)).tracked).toBe(before[1]!.tracked);
    expect((await service.overview(employee)).tracked).toBe(before[2]!.tracked);
    await expect(service.ticket(employee, ticket.id)).rejects.toMatchObject({ status: 404 });
  });
  it('calculates all four demonstration targets using business time', async () => {
    for (const [p, response, resolution] of [
      ['low', 960, 2400],
      ['medium', 480, 1440],
      ['high', 120, 480],
      ['critical', 30, 240],
    ] as const) {
      const { sla } = await make(p);
      expect(businessMinutesBetween(sla.startedAt, sla.responseDueAt, calendar)).toBe(response);
      expect(businessMinutesBetween(sla.startedAt, sla.resolutionDueAt, calendar)).toBe(resolution);
    }
  });
  it('skips weekends and explicitly configured holidays', () => {
    const friday = new Date('2026-10-23T09:30:00Z');
    expect(addBusinessMinutes(friday, 60, calendar).toISOString()).toBe('2026-10-26T01:30:00.000Z');
    expect(
      addBusinessMinutes(friday, 60, { ...calendar, holidays: ['2026-10-26'] }).toISOString(),
    ).toBe('2026-10-27T01:30:00.000Z');
    expect(businessMinutesBetween(friday, new Date('2026-10-26T01:30Z'), calendar)).toBe(60);
  });
  it('handles before/after hours and rejects invalid calendar inputs', () => {
    expect(addBusinessMinutes(new Date('2026-10-19T00:00Z'), 30, calendar).toISOString()).toBe(
      '2026-10-19T01:30:00.000Z',
    );
    expect(addBusinessMinutes(new Date('2026-10-19T10:00Z'), 30, calendar).toISOString()).toBe(
      '2026-10-20T01:30:00.000Z',
    );
    expect(calendarInput.safeParse({ ...calendar, holidays: ['2026-02-30'] }).success).toBe(false);
    expect(calendarInput.safeParse({ ...calendar, startHour: 18, endHour: 9 }).success).toBe(false);
  });
  it('counts only qualifying public support replies as first response', async () => {
    const { ticket, sla } = await make();
    await event(ticket.id, 'Internal note added', agent.id, new Date('2026-10-19T01:05Z'), true);
    expect((await slaFor(sla.id)).firstRespondedAt).toBeNull();
    await event(ticket.id, 'Reply added', employee.id);
    expect((await slaFor(sla.id)).firstRespondedAt).toBeNull();
    await event(ticket.id, 'Reply added');
    expect((await slaFor(sla.id)).responseMinutes).toBe(10);
    await event(ticket.id, 'Reply added', admin.id, new Date('2026-10-19T02:00Z'));
    expect((await slaFor(sla.id)).responseMinutes).toBe(10);
  });
  it('persists warning and breach once across repeated and concurrent runs', async () => {
    const { ticket, sla } = await make();
    await monitorSla(fixture.db, new Date('2026-10-19T01:24Z'));
    expect((await slaFor(sla.id)).responseWarnedAt).not.toBeNull();
    await Promise.all([
      monitorSla(fixture.db, new Date('2026-10-19T05:01Z')),
      monitorSla(fixture.db, new Date('2026-10-19T05:01Z')),
    ]);
    const row = await slaFor(sla.id);
    expect(row.responseBreachedAt?.toISOString()).toBe(sla.responseDueAt.toISOString());
    expect(row.resolutionBreachedAt).not.toBeNull();
    const events = await fixture.db
      .select()
      .from(operationEvents)
      .where(
        and(eq(operationEvents.ticketId, ticket.id), eq(operationEvents.type, 'sla_breached')),
      );
    expect(events).toHaveLength(2);
    await monitorSla(fixture.db, new Date('2026-10-20T05:00Z'));
    expect((await slaFor(sla.id)).nextCheckAt).toBeNull();
  });
  it('captures on-time and late outcomes, keeps Pending running and restarts a new cycle on reopen', async () => {
    const { ticket, sla } = await make();
    await event(ticket.id, 'Reply added');
    await fixture.db.update(tickets).set({ status: 'pending' }).where(eq(tickets.id, ticket.id));
    expect((await slaFor(sla.id)).resolutionDueAt).toEqual(sla.resolutionDueAt);
    await event(ticket.id, 'Resolution submitted', agent.id, new Date('2026-10-19T04:00Z'));
    expect(slaView(await slaFor(sla.id)).resolutionState).toBe('Completed Within Target');
    await event(ticket.id, 'Ticket reopened', employee.id, new Date('2026-10-20T01:00Z'));
    const cycles = await slaService(fixture.db).ticket(admin, ticket.id);
    expect(cycles).toHaveLength(2);
    expect(cycles[0]!.cycle).toBe(2);
    expect(cycles[0]!.firstRespondedAt).toBeNull();
    await event(ticket.id, 'Resolution submitted', agent.id, new Date('2026-10-20T06:00Z'));
    expect((await slaService(fixture.db).ticket(admin, ticket.id))[0]!.resolutionState).toBe(
      'Completed After Breach',
    );
    await event(ticket.id, 'Reply added', agent.id, new Date('2026-10-20T07:00Z'));
    expect((await slaService(fixture.db).ticket(admin, ticket.id))[0]!.firstRespondedAt).toBeNull();
  });
  it('keeps applied snapshots after policy edits and denies non-admin edits', async () => {
    const { sla } = await make('low');
    const [policy] = await fixture.db
      .select()
      .from(slaPolicies)
      .where(eq(slaPolicies.id, sla.policyId));
    const body = {
      name: policy!.name,
      responseMinutes: 123,
      resolutionMinutes: policy!.resolutionMinutes,
      warningPercent: 80,
      calendar,
      active: true,
    };
    await expect(slaService(fixture.db).update(employee, policy!.id, body)).rejects.toMatchObject({
      status: 403,
    });
    await slaService(fixture.db).update(admin, policy!.id, body);
    expect((await slaFor(sla.id)).snapshot.responseMinutes).toBe(960);
    await slaService(fixture.db).update(admin, policy!.id, { ...body, responseMinutes: 960 });
  });
});
describe('durable events and private notifications', () => {
  it('retains committed notifications when live delivery fails and resumes without duplicates', async () => {
    await processEvents(fixture.db);
    const { ticket } = await make();
    await event(ticket.id, 'Ticket assigned', admin.id);
    await expect(
      processEvents(fixture.db, async () => {
        throw Error('transport interrupted');
      }),
    ).rejects.toThrow('transport interrupted');
    const rows = await fixture.db
      .select()
      .from(notifications)
      .where(eq(notifications.ticketId, ticket.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.recipientId).toBe(agent.id);
    await processEvents(fixture.db);
    expect(
      await fixture.db.select().from(notifications).where(eq(notifications.ticketId, ticket.id)),
    ).toEqual(rows);
  });
  it('persists correct assignment and reply recipients, deduplicates processing and retains read state', async () => {
    const { ticket } = await make();
    await event(ticket.id, 'Ticket assigned', admin.id);
    await event(ticket.id, 'Reply added');
    await Promise.all([processEvents(fixture.db), processEvents(fixture.db)]);
    const rows = await fixture.db
      .select()
      .from(notifications)
      .where(eq(notifications.ticketId, ticket.id));
    expect(rows.filter((n) => n.type === 'ticket_assigned').map((n) => n.recipientId)).toEqual([
      agent.id,
    ]);
    expect(
      rows.filter((n) => n.type === 'ticket_reply_received').map((n) => n.recipientId),
    ).toContain(employee.id);
    expect(rows.some((n) => n.type === 'ticket_reply_received' && n.recipientId === agent.id)).toBe(
      false,
    );
    const own = rows.find((n) => n.recipientId === employee.id)!;
    const service = notificationService(fixture.db);
    await expect(service.read(agent, own.id)).rejects.toMatchObject({ status: 404 });
    await service.read(employee, own.id);
    expect(
      (await service.list(employee, { state: 'read', limit: 100 })).items.some(
        (n) => n.id === own.id,
      ),
    ).toBe(true);
    await processEvents(fixture.db);
    expect(
      (await fixture.db.select().from(notifications).where(eq(notifications.ticketId, ticket.id)))
        .length,
    ).toBe(rows.length);
  });
  it('does not leak internal notes or old assignment notifications', async () => {
    const { ticket } = await make();
    await event(ticket.id, 'Internal note added', agent.id, new Date(), true);
    await processEvents(fixture.db);
    expect(
      (await notificationService(fixture.db).list(employee, { limit: 100 })).items.some(
        (n) => n.ticketId === ticket.id,
      ),
    ).toBe(false);
    await event(ticket.id, 'Ticket assigned', admin.id);
    await processEvents(fixture.db);
    await fixture.db
      .update(tickets)
      .set({ assignedAgentId: null })
      .where(eq(tickets.id, ticket.id));
    expect(
      (await notificationService(fixture.db).list(agent, { limit: 100 })).items.some(
        (n) => n.ticketId === ticket.id,
      ),
    ).toBe(false);
  });
  it('honors stored preferences and rolls back outbox/SLA with failed business mutations', async () => {
    const { ticket } = await make();
    const service = notificationService(fixture.db);
    await service.savePreferences(employee, {
      assignments: true,
      replies: false,
      status: true,
      escalations: true,
      sla: true,
    });
    await event(ticket.id, 'Reply added');
    await processEvents(fixture.db);
    expect(
      await fixture.db
        .select()
        .from(notifications)
        .where(
          and(eq(notifications.ticketId, ticket.id), eq(notifications.recipientId, employee.id)),
        ),
    ).toHaveLength(0);
    await service.savePreferences(employee, {
      assignments: true,
      replies: true,
      status: true,
      escalations: true,
      sla: true,
    });
    const beforeEvents = await fixture.db
      .select()
      .from(operationEvents)
      .where(eq(operationEvents.ticketId, ticket.id));
    const beforeSla = await fixture.db
      .select()
      .from(ticketSlas)
      .where(eq(ticketSlas.ticketId, ticket.id));
    await expect(
      fixture.db.transaction(async (tx) => {
        await recordOperation(tx, {
          ticketId: ticket.id,
          actorId: agent.id,
          action: 'Resolution submitted',
        });
        throw Error('rollback');
      }),
    ).rejects.toThrow();
    expect(
      await fixture.db
        .select()
        .from(operationEvents)
        .where(eq(operationEvents.ticketId, ticket.id)),
    ).toEqual(beforeEvents);
    expect(
      await fixture.db.select().from(ticketSlas).where(eq(ticketSlas.ticketId, ticket.id)),
    ).toEqual(beforeSla);
  });
});
describe('filtered analytics and exports', () => {
  it('uses inclusive Manila dates and real status/priority/category/department/agent filters', async () => {
    const { ticket } = await make('high', new Date('2026-02-02T01:00Z'));
    const q = {
      from: '2026-02-02',
      to: '2026-02-02',
      priority: 'high',
      status: 'open',
      category,
      agent: agent.id,
      department: employee.departmentId!,
    };
    const report = await reports(fixture.db, admin, q);
    expect(report.data.metrics.total).toBe(1);
    expect(report.data.agents[0]!.assigned).toBe(1);
    expect(report.csv()).toContain(ticket.subject);
    expect(
      (await reports(fixture.db, admin, { ...q, priority: 'critical' })).data.metrics.total,
    ).toBe(0);
    await expect(reports(fixture.db, employee, q)).rejects.toMatchObject({ status: 403 });
    await expect(
      reports(fixture.db, admin, { from: '2020-01-01', to: '2026-01-01' }),
    ).rejects.toMatchObject({ status: 400 });
    const [unusual] = await fixture.db
      .insert(categories)
      .values({ name: 'constructor' })
      .returning();
    await fixture.db
      .update(tickets)
      .set({ categoryId: unusual!.id })
      .where(eq(tickets.id, ticket.id));
    expect(
      (await reports(fixture.db, admin, { ...q, category: unusual!.id })).data.categories,
    ).toEqual([{ name: 'constructor', value: 1 }]);
  });
  it('uses completed denominators, preserves separate cycles and neutralizes CSV formulas', async () => {
    const { ticket } = await make('critical', new Date('2026-02-03T01:00Z'));
    await event(ticket.id, 'Reply added', agent.id, new Date('2026-02-03T01:10Z'));
    await event(ticket.id, 'Resolution submitted', agent.id, new Date('2026-02-03T02:00Z'));
    const report = await reports(fixture.db, admin, {
      from: '2026-02-03',
      to: '2026-02-03',
      format: 'sla',
    });
    expect(report.data.metrics.compliance).toBe(100);
    expect(report.data.metrics.averageResponseMinutes).toBe(10);
    expect(report.data.metrics.averageResolutionMinutes).toBe(60);
    expect(report.csv()).toContain('Completed Within Target');
    for (const format of ['summary', 'performance', 'agents', 'sla']) {
      const exported = await reports(fixture.db, admin, {
        from: '2026-02-03',
        to: '2026-02-03',
        format,
      });
      expect(exported.csv().split('\r\n').length).toBeGreaterThan(1);
      expect(exported.csv()).not.toMatch(/password_hash|session_secret|token_hash/i);
    }
    for (const value of ['=CMD()', '+1', '-1', '@SUM(A1)', '\t=1', '  =1'])
      expect(csvValue(value)).toContain("'");
    expect(csvValue('a,"b"')).toBe('"a,""b"""');
  });
  it('protects notification, SLA policy and export HTTP endpoints', async () => {
    const app = createApp(fixture.db, fixture.config),
      http = request.agent(app);
    const pre = await http.get('/api/auth/csrf');
    const login = await http
      .post('/api/auth/login')
      .set('Origin', fixture.config.CLIENT_ORIGIN)
      .set('X-CSRF-Token', pre.body.data.csrfToken)
      .send({ email: employee.email, password: fixture.secrets.SEED_EMPLOYEE_PASSWORD });
    expect(login.status).toBe(200);
    expect((await http.get('/api/reports/export')).status).toBe(403);
    expect((await http.get('/api/sla/policies')).status).toBe(403);
    expect((await request(app).get('/api/notifications')).status).toBe(401);
    expect((await http.patch('/api/notifications/read-all').send({})).status).toBe(403);
  });
});
describe('authenticated real-time transport', () => {
  it('rejects anonymous and wrong-origin connections and arbitrary subscriptions; delivers only authorized operations and revokes logout', async () => {
    const config = {
      ...fixture.config,
      EVENT_POLL_INTERVAL_MS: 250,
      SLA_CHECK_INTERVAL_MS: 300000,
    };
    const http = createServer(createApp(fixture.db, config));
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
    const port = (http.address() as { port: number }).port;
    const ops = startOperations(http, fixture.db, config),
      auth = authService(fixture.db, config);
    const sockets: Socket[] = [];
    function connect(cookie = '', csrf = '', origin = config.CLIENT_ORIGIN) {
      const socket = io(`http://127.0.0.1:${port}`, {
        transports: ['websocket'],
        reconnection: false,
        auth: { csrf },
        extraHeaders: { Origin: origin, Cookie: cookie },
      });
      sockets.push(socket);
      return socket;
    }
    const ready = (s: Socket) =>
      new Promise<void>((resolve, reject) => {
        s.once('connect', () => resolve());
        s.once('connect_error', reject);
      });
    try {
      await expect(ready(connect())).rejects.toThrow();
      const a = await auth.login(admin.email, fixture.secrets.SEED_ADMIN_PASSWORD, false),
        e = await auth.login(employee.email, fixture.secrets.SEED_EMPLOYEE_PASSWORD, false),
        g = await auth.login(agent.email, fixture.secrets.SEED_AGENT_PASSWORD, false);
      await expect(
        ready(connect('resolvedesk=' + a.token, a.csrfToken, 'https://untrusted.example')),
      ).rejects.toThrow();
      await expect(ready(connect('resolvedesk=' + a.token, 'invalid-csrf'))).rejects.toThrow();
      const sa = connect('resolvedesk=' + a.token, a.csrfToken),
        se = connect('resolvedesk=' + e.token, e.csrfToken),
        sg = connect('resolvedesk=' + g.token, g.csrfToken);
      await Promise.all([ready(sa), ready(se), ready(sg)]);
      const denied = await new Promise<{ ok: boolean }>((r) =>
        se.emit('subscribe-ticket', randomUUID(), r),
      );
      expect(denied.ok).toBe(false);
      const unrelated = await make();
      await fixture.db
        .update(tickets)
        .set({ requesterId: admin.id, assignedAgentId: null })
        .where(eq(tickets.id, unrelated.ticket.id));
      // Use a new socket so subscription throttling cannot mask the object authorization check.
      const unrelatedViewer = connect('resolvedesk=' + e.token, e.csrfToken);
      await ready(unrelatedViewer);
      const crossTicket = await new Promise<{ ok: boolean }>((r) =>
        unrelatedViewer.emit('subscribe-ticket', unrelated.ticket.id, r),
      );
      expect(crossTicket.ok).toBe(false);
      unrelatedViewer.disconnect();
      const { ticket } = await make();
      const employeeEvents: unknown[] = [];
      se.on('operation', (v) => employeeEvents.push(v));
      const received = new Promise<{ type: string; ticketId: string }>((r) => {
        const listener = (value: { type: string; ticketId: string }) => {
          if (value.type === 'internal_note_created' && value.ticketId === ticket.id) {
            sa.off('operation', listener);
            r(value);
          }
        };
        sa.on('operation', listener);
      });
      await event(ticket.id, 'Internal note added', agent.id, new Date(), true);
      await ops.tick();
      expect((await received).type).toBe('internal_note_created');
      expect(employeeEvents.some((v) => (v as { ticketId: string }).ticketId === ticket.id)).toBe(
        false,
      );
      const assigned = new Promise<{ type: string }>((r) => {
        const listener = (value: { type: string; ticketId: string }) => {
          if (value.type === 'ticket_assigned' && value.ticketId === ticket.id) {
            sg.off('operation', listener);
            r(value);
          }
        };
        sg.on('operation', listener);
      });
      await event(ticket.id, 'Ticket assigned', admin.id, new Date());
      await ops.tick();
      expect((await assigned).type).toBe('ticket_assigned');
      const disconnected = new Promise<void>((r) => se.once('disconnect', () => r()));
      await auth.logout(e.token);
      await ops.tick();
      await disconnected;
      await expect(ready(connect('resolvedesk=' + e.token, e.csrfToken))).rejects.toThrow();
      const expired = new Promise<void>((r) => sg.once('disconnect', () => r()));
      await fixture.db
        .update(sessions)
        .set({ expiresAt: new Date(0) })
        .where(eq(sessions.userId, agent.id));
      await ops.tick();
      await expired;
      const roleChanged = new Promise<void>((r) => sa.once('disconnect', () => r()));
      await fixture.db.update(users).set({ role: 'employee' }).where(eq(users.id, admin.id));
      await ops.tick();
      await roleChanged;
      await fixture.db.update(users).set({ role: 'admin' }).where(eq(users.id, admin.id));
    } finally {
      for (const s of sockets) s.disconnect();
      await ops.stop();
    }
  }, 30000);
});
