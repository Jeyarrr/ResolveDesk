import { eq, sql } from 'drizzle-orm';
import type { Executor } from '../db/connection.js';
import { users, departments } from '../db/schema.js';
export const safeUserFields = {
  id: users.id,
  name: users.fullName,
  email: users.email,
  role: users.role,
  accountStatus: users.accountStatus,
  departmentId: users.departmentId,
  department: sql<string>`coalesce(${departments.name}, '')`,
  passwordReady: sql<boolean>`${users.passwordHash} is not null`,
  createdAt: users.createdAt,
  lastLoginAt: users.lastLoginAt,
};
export async function profile(db: Executor, id: string) {
  const [u] = await db
    .select(safeUserFields)
    .from(users)
    .leftJoin(departments, eq(departments.id, users.departmentId))
    .where(eq(users.id, id));
  if (!u) throw new Error('Profile unavailable');
  return displayUser(u);
}
export function displayUser<T extends { name: string; accountStatus: string }>(u: T) {
  return {
    ...u,
    status: u.accountStatus === 'active' ? ('Active' as const) : ('Away' as const),
    initials: u.name
      .split(/\s+/)
      .map((s) => s[0])
      .slice(0, 2)
      .join('')
      .toUpperCase(),
  };
}
