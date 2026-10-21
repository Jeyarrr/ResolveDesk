import { eq, sql } from 'drizzle-orm';
import { readConfig } from '../config/env.js';
import { connectDatabase } from './connection.js';
import { email, password } from '../validation/schemas.js';
import { users, sessions } from './schema.js';
import { hashPassword } from '../services/auth.js';
const config = readConfig();
if (config.NODE_ENV !== 'development')
  throw new Error(
    'Password provisioning is development-only; production onboarding requires a verified delivery workflow.',
  );
const address = email.safeParse(process.env.PROVISION_EMAIL),
  secret = password.safeParse(process.env.PROVISION_PASSWORD);
if (!address.success || !secret.success)
  throw new Error(
    'Set PROVISION_EMAIL and PROVISION_PASSWORD (12–128 characters) in the ignored server environment.',
  );
const { db, pool } = connectDatabase(config);
try {
  const hash = await hashPassword(secret.data);
  await db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE`);
    const [row] = await tx
      .update(users)
      .set({ passwordHash: hash, accountStatus: 'active', updatedAt: new Date() })
      .where(sql`lower(${users.email}) = ${address.data}`)
      .returning({ id: users.id });
    if (!row) throw new Error('Create this account through the administrator interface first');
    await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, row.id));
  });
  console.log(
    'Development password provisioned and sessions revoked. Remove PROVISION_PASSWORD from your environment.',
  );
} catch {
  console.error('Provisioning failed; check account existence and database connectivity.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
