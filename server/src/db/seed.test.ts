import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { testDatabase } from '../test/database.js';
import { authService } from '../services/auth.js';
import { seedDevelopment } from './seed.js';
import { activity, comments, departments, sessions, tickets, users } from './schema.js';

let fixture: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  fixture = await testDatabase();
}, 60000);
afterAll(async () => {
  await fixture?.engine.close();
});

describe('development account identities', () => {
  it('seeds Jayr, Mon, and George with the correct existing roles and departments', async () => {
    const accounts = await fixture.db
      .select({
        name: users.fullName,
        email: users.email,
        role: users.role,
        department: departments.name,
      })
      .from(users)
      .innerJoin(departments, eq(users.departmentId, departments.id))
      .orderBy(users.email);
    expect(accounts).toEqual([
      {
        name: 'Jayr',
        email: 'admin@resolvedesk.example',
        role: 'admin',
        department: 'Administration',
      },
      {
        name: 'George',
        email: 'agent@resolvedesk.example',
        role: 'agent',
        department: 'Human Resources',
      },
      {
        name: 'Mon',
        email: 'employee@resolvedesk.example',
        role: 'employee',
        department: 'General',
      },
    ]);
  });

  it('reseeds without changing account IDs, emails, hashes, sessions, or ticket relationships', async () => {
    const auth = authService(fixture.db, fixture.config);
    const signedIn = await auth.login(
      'agent@resolvedesk.example',
      fixture.secrets.SEED_AGENT_PASSWORD,
      false,
    );
    const snapshot = async () => ({
      users: await fixture.db.select().from(users).orderBy(users.id),
      sessions: await fixture.db.select().from(sessions).orderBy(sessions.id),
      tickets: await fixture.db.select().from(tickets).orderBy(tickets.id),
      comments: await fixture.db.select().from(comments).orderBy(comments.id),
      activity: await fixture.db.select().from(activity).orderBy(activity.id),
      departments: await fixture.db.select().from(departments).orderBy(departments.id),
    });
    const before = await snapshot();
    await seedDevelopment(fixture.db, {
      SEED_ADMIN_PASSWORD: randomBytes(24).toString('hex'),
      SEED_AGENT_PASSWORD: randomBytes(24).toString('hex'),
      SEED_EMPLOYEE_PASSWORD: randomBytes(24).toString('hex'),
    });
    expect(await snapshot()).toEqual(before);
    const restored = await auth.authenticate(signedIn.token);
    expect(restored.user.fullName).toBe('George');
    expect(restored.user.role).toBe('agent');
  }, 30000);
});
