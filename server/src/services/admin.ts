import { and, eq, ilike, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Database, Executor } from '../db/connection.js';
import { categories, departments, sessions, tickets, users } from '../db/schema.js';
import { AppError } from '../middleware/errors.js';
import { displayUser, profile, safeUserFields } from '../repositories/users.js';
import type {
  referenceInput,
  referencePatch,
  userInput,
  userPatch,
  userQuery,
} from '../validation/schemas.js';
async function departmentExists(db: Executor, id?: string | null) {
  if (!id) return;
  const [row] = await db
    .select()
    .from(departments)
    .where(and(eq(departments.id, id), eq(departments.active, true)))
    .for('share');
  if (!row) throw new AppError(400, 'Select an active department');
}
export function adminService(db: Database) {
  return {
    async list(q: z.infer<typeof userQuery>) {
      const search = `%${q.search.replace(/[\\%_]/g, '\\$&')}%`;
      const where = and(
        q.search ? or(ilike(users.fullName, search), ilike(users.email, search)) : undefined,
        q.role ? eq(users.role, q.role) : undefined,
        q.accountStatus ? eq(users.accountStatus, q.accountStatus) : undefined,
      );
      const items = await db
        .select(safeUserFields)
        .from(users)
        .leftJoin(departments, eq(departments.id, users.departmentId))
        .where(where)
        .orderBy(users.fullName, users.id)
        .limit(q.limit)
        .offset((q.page - 1) * q.limit);
      const [count] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(where);
      return { items: items.map(displayUser), total: count!.count, page: q.page, limit: q.limit };
    },
    async create(input: z.infer<typeof userInput>) {
      if (input.accountStatus === 'active')
        throw new AppError(400, 'New accounts must be inactive until a password is provisioned');
      return db.transaction(async (tx) => {
        await departmentExists(tx, input.departmentId);
        const [row] = await tx.insert(users).values(input).returning({ id: users.id });
        return profile(tx, row!.id);
      });
    },
    async update(id: string, input: z.infer<typeof userPatch>) {
      return db.transaction(async (tx) => {
        // Serialize all admin account changes, including concurrent attempts to remove different admins.
        await tx.execute(sql`LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE`);
        const [current] = await tx.select().from(users).where(eq(users.id, id)).for('update');
        if (!current) throw new AppError(404, 'User not found');
        const next = { ...current, ...input };
        if (next.accountStatus === 'active' && !next.passwordHash)
          throw new AppError(409, 'Provision a password before activating this account');
        if (
          current.role === 'admin' &&
          current.accountStatus === 'active' &&
          (next.role !== 'admin' || next.accountStatus !== 'active')
        ) {
          const [count] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(users)
            .where(and(eq(users.role, 'admin'), eq(users.accountStatus, 'active')));
          if (count!.count <= 1)
            throw new AppError(409, 'The last active administrator must remain active');
        }
        if (
          current.role === 'agent' &&
          (next.role !== 'agent' || next.accountStatus !== 'active')
        ) {
          const [assigned] = await tx
            .select({ id: tickets.id })
            .from(tickets)
            .where(eq(tickets.assignedAgentId, id))
            .limit(1);
          if (assigned)
            throw new AppError(
              409,
              'Reassign or unassign this agent’s tickets before changing role or status',
            );
        }
        if (input.departmentId !== current.departmentId)
          await departmentExists(tx, input.departmentId);
        await tx
          .update(users)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(users.id, id));
        if (
          next.role !== current.role ||
          next.accountStatus !== current.accountStatus ||
          next.email !== current.email ||
          next.username !== current.username
        )
          await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, id));
        return profile(tx, id);
      });
    },
    async references(kind: 'departments' | 'categories', admin: boolean) {
      const table = kind === 'departments' ? departments : categories;
      return db
        .select()
        .from(table)
        .where(admin ? undefined : eq(table.active, true))
        .orderBy(table.name);
    },
    async referenceCreate(
      kind: 'departments' | 'categories',
      input: z.infer<typeof referenceInput>,
    ) {
      const table = kind === 'departments' ? departments : categories;
      const [row] = await db.insert(table).values(input).returning();
      return row;
    },
    async referenceUpdate(
      kind: 'departments' | 'categories',
      id: string,
      input: z.infer<typeof referencePatch>,
    ) {
      const table = kind === 'departments' ? departments : categories;
      const [row] = await db
        .update(table)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(table.id, id))
        .returning();
      if (!row) throw new AppError(404, 'Record not found');
      return row;
    },
  };
}
