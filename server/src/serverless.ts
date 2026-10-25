import { attachDatabasePool } from '@vercel/functions';
import { readConfig } from './config/env.js';
import { connectDatabase } from './db/connection.js';
import { createApp } from './app.js';

// One reused pool per warm function. No listen(), timers, seeding or migrations.
const config = readConfig({
  ...process.env,
  NODE_ENV: 'production',
  SERVERLESS: 'true',
  STORAGE_DRIVER: 'blob',
  TRUST_PROXY: '1',
});
if (!config.CRON_SECRET) throw new Error('Set CRON_SECRET before deploying ResolveDesk');
const { db, pool } = connectDatabase(config);
attachDatabasePool(pool);
export default createApp(db, config);
