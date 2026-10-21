import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { readConfig } from '../config/env.js';
import { connectDatabase } from '../db/connection.js';
import { seedDevelopment } from '../db/seed.js';
import { testDatabase } from './database.js';

export async function lifecycleTestDatabase(
  secrets = {
    SEED_ADMIN_PASSWORD: randomBytes(24).toString('hex'),
    SEED_AGENT_PASSWORD: randomBytes(24).toString('hex'),
    SEED_EMPLOYEE_PASSWORD: randomBytes(24).toString('hex'),
  },
) {
  const connection = process.env.TEST_DATABASE_URL;
  if (!connection) return { ...(await testDatabase(undefined, secrets)), pool: undefined };
  const url = new URL(connection);
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    !/^\/resolvedesk_test_[a-z0-9_]+$/.test(url.pathname)
  )
    throw new Error('Tests require a separate local resolvedesk_test_* database');
  const config = readConfig({
    NODE_ENV: 'test',
    DATABASE_URL: connection,
    DB_SSL: 'false',
    DB_POOL_MAX: '5',
    SESSION_SECRET: randomBytes(32).toString('hex'),
    CLIENT_ORIGIN: 'http://127.0.0.1:5173',
  });
  const { db, pool } = connectDatabase(config);
  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
    });
    await seedDevelopment(db, secrets);
    return { db, pool, config, secrets, engine: { close: () => pool.end() } };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
