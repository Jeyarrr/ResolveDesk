import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Database } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { readConfig } from '../config/env.js';
import { seedDevelopment } from '../db/seed.js';
export async function testDatabase(
  dataDir?: string,
  secrets = {
    SEED_ADMIN_PASSWORD: randomBytes(24).toString('hex'),
    SEED_AGENT_PASSWORD: randomBytes(24).toString('hex'),
    SEED_EMPLOYEE_PASSWORD: randomBytes(24).toString('hex'),
  },
) {
  // Test-only PostgreSQL WASM engine. Never reads DATABASE_URL or connects to Neon.
  const engine = new PGlite(dataDir);
  const local = drizzle(engine, { schema });
  await migrate(local, {
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  });
  // The services use only the common PostgreSQL query/transaction API.
  const db = local as unknown as Database;
  await seedDevelopment(db, secrets);
  const config = readConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://unused/isolated',
    SESSION_SECRET: randomBytes(32).toString('hex'),
    DB_SSL: 'false',
    CLIENT_ORIGIN: 'http://127.0.0.1:5173',
  });
  return { db, engine, config, secrets };
}
