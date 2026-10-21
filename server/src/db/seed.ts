import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './connection.js';
import { categories, departments, users } from './schema.js';
import { hashPassword } from '../services/auth.js';
import { ticketService } from '../services/tickets.js';
import { password } from '../validation/schemas.js';
export const seedInputs = z.object({
  SEED_ADMIN_PASSWORD: password,
  SEED_AGENT_PASSWORD: password,
  SEED_EMPLOYEE_PASSWORD: password,
});
export async function seedDevelopment(db: Database, secrets: z.infer<typeof seedInputs>) {
  for (const name of [
    'Information Technology',
    'Human Resources',
    'Finance',
    'Operations',
    'Administration',
  ])
    await db.insert(departments).values({ name }).onConflictDoNothing();
  for (const name of [
    'Hardware',
    'Software',
    'Network',
    'Account Access',
    'Email',
    'Printer',
    'Other',
  ])
    await db.insert(categories).values({ name }).onConflictDoNothing();
  const [department] = await db
    .select()
    .from(departments)
    .where(eq(departments.name, 'Information Technology'));
  for (const [role, name, secret] of [
    ['admin', 'Taylor Brooks', secrets.SEED_ADMIN_PASSWORD],
    ['agent', 'Jordan Lee', secrets.SEED_AGENT_PASSWORD],
    ['employee', 'Alex Morgan', secrets.SEED_EMPLOYEE_PASSWORD],
  ] as const) {
    const email = `${role}@resolvedesk.example`;
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (!existing)
      await db
        .insert(users)
        .values({
          fullName: name,
          email,
          role,
          accountStatus: 'active',
          departmentId: department!.id,
          passwordHash: await hashPassword(secret),
        })
        .onConflictDoNothing();
  }
  // Seed ticket creation uses the same transactional services as the API.
  const [employee] = await db
    .select()
    .from(users)
    .where(eq(users.email, 'employee@resolvedesk.example'));
  const [admin] = await db.select().from(users).where(eq(users.email, 'admin@resolvedesk.example'));
  const [agent] = await db.select().from(users).where(eq(users.email, 'agent@resolvedesk.example'));
  const [category] = await db.select().from(categories).where(eq(categories.name, 'Network'));
  const { tickets } = await import('./schema.js');
  const [existingTicket] = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(eq(tickets.subject, '[Development] VPN connection drops'));
  if (!existingTicket) {
    const service = ticketService(db);
    const ticket = await service.create(employee!, {
      subject: '[Development] VPN connection drops',
      description:
        'The VPN connection disconnects during video meetings. Please help investigate the network configuration.',
      categoryId: category!.id,
      priority: 'high',
    });
    await service.assign(admin!, ticket.id, agent!.id);
    await service.comment(agent!, ticket.id, {
      message: 'Please share the approximate time of the next disconnect.',
      isInternal: false,
    });
    await service.comment(agent!, ticket.id, {
      message: 'Review the VPN gateway logs during investigation.',
      isInternal: true,
    });
  }
}
