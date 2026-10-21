import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { connectDatabase } from './connection.js';
import { readConfig } from '../config/env.js';
const { db, pool } = connectDatabase(readConfig());
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
