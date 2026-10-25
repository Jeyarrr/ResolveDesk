import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { readConfig } from '../config/env.js';
import { connectDatabase } from './connection.js';
import { categories, departments, users } from './schema.js';
import { email, password, username } from '../validation/schemas.js';
import { hashPassword } from '../services/auth.js';

// Operator-only bootstrap for an empty production database. Never run during a deployment build.
const config = readConfig();
if (config.NODE_ENV !== 'production' || process.env.CONFIRM_PRODUCTION_BOOTSTRAP !== 'yes')
  throw new Error(
    'Set NODE_ENV=production and CONFIRM_PRODUCTION_BOOTSTRAP=yes for an empty production database',
  );
const input = z
  .object({
    BOOTSTRAP_ADMIN_NAME: z.string().trim().min(2).max(100),
    BOOTSTRAP_ADMIN_EMAIL: email,
    BOOTSTRAP_ADMIN_USERNAME: username,
    BOOTSTRAP_ADMIN_PASSWORD: password,
  })
  .safeParse(process.env);
if (!input.success)
  throw new Error('Set all BOOTSTRAP_ADMIN_* variables; use a unique 12–128 character password');
const { db, pool } = connectDatabase({
  ...config,
  DATABASE_URL: config.DIRECT_DATABASE_URL ?? config.DATABASE_URL,
  DB_POOL_MAX: 1,
});
try {
  const passwordHash = await hashPassword(input.data.BOOTSTRAP_ADMIN_PASSWORD);
  await db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE`);
    if ((await tx.select({ id: users.id }).from(users).limit(1)).length)
      throw new Error('Bootstrap requires an empty users table');
    for (const name of [
      'Information Technology',
      'Human Resources',
      'Finance',
      'Operations',
      'Administration',
      'General',
    ])
      await tx.insert(departments).values({ name }).onConflictDoNothing();
    for (const name of [
      'Hardware',
      'Software',
      'Network',
      'Account Access',
      'Email',
      'Printer',
      'Other',
    ])
      await tx.insert(categories).values({ name }).onConflictDoNothing();
    const [department] = await tx
      .select()
      .from(departments)
      .where(eq(departments.name, 'Administration'));
    await tx.insert(users).values({
      fullName: input.data.BOOTSTRAP_ADMIN_NAME,
      email: input.data.BOOTSTRAP_ADMIN_EMAIL,
      username: input.data.BOOTSTRAP_ADMIN_USERNAME,
      passwordHash,
      role: 'admin',
      accountStatus: 'active',
      departmentId: department!.id,
    });
  });
  console.log(
    'Production administrator and reference data created. Clear bootstrap credentials from your environment.',
  );
} catch {
  console.error(
    'Bootstrap was not applied. Confirm migrations, connectivity, and that the users table is empty. Existing users were not changed.',
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
