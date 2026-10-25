import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { connectDatabase } from './connection.js';
import { readConfig } from '../config/env.js';
const config = readConfig();
const { db, pool } = connectDatabase({
  ...config,
  DATABASE_URL: config.DIRECT_DATABASE_URL ?? config.DATABASE_URL,
  DB_POOL_MAX: 1,
});
try {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) });
  console.log('Database migrations applied.');
} catch {
  console.error(
    'Migration failed. Check connectivity and inspect migration history; no reset was attempted.',
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
