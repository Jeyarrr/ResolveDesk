import { and, asc, eq, ilike, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Database } from '../db/connection.js';
import { departments, tickets, users, type Actor } from '../db/schema.js';
import { AppError } from '../middleware/errors.js';
import type { pagination } from '../validation/schemas.js';

export async function agentWorkloads(db: Database, actor: Actor, q: z.infer<typeof pagination>) {
  if (actor.role !== 'admin')
    throw new AppError(403, 'Only administrators can view agent workloads');
  const search = q.search.replace(/[\\%_]/g, '\\$&');
  const where = and(
    eq(users.role, 'agent'),
    eq(users.accountStatus, 'active'),
    search ? ilike(users.fullName, `%${search}%`) : undefined,
  );
  const count = (status: typeof tickets.$inferSelect.status) =>
    sql<number>`count(${tickets.id}) filter (where ${tickets.status} = ${status})::int`;
  const [items, totals] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.fullName,
        department: departments.name,
        total: sql<number>`count(${tickets.id})::int`,
        open: count('open'),
        inProgress: count('in_progress'),
        pending: count('pending'),
        resolved: count('resolved'),
        closed: count('closed'),
      })
      .from(users)
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .leftJoin(tickets, eq(tickets.assignedAgentId, users.id))
      .where(where)
      .groupBy(users.id, departments.id)
      .orderBy(asc(users.fullName), asc(users.id))
      .limit(q.limit)
      .offset((q.page - 1) * q.limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(where),
  ]);
  return { items, total: totals[0]?.count ?? 0, page: q.page, limit: q.limit };
}
