import { attachDatabasePool } from '@vercel/functions';
import { readConfig } from './config/env.js';
import { connectDatabase } from './db/connection.js';
import { createApp } from './app.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

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
const app = createApp(db, config);

export default function handler(
  req: IncomingMessage & { query?: Record<string, unknown> },
  res: ServerResponse,
) {
  // Vercel expands the catch-all rewrite into a synthetic `path` query key.
  // Remove only that routing value before strict API query validation runs.
  const url = new URL(req.url ?? '/', 'http://localhost');
  const routePath = url.pathname.replace(/^\/api\/?/, '');
  if (url.searchParams.get('path') === routePath) {
    url.searchParams.delete('path');
    req.url = url.pathname + url.search;
  }
  // The Node function runtime may already have parsed query before Express.
  if (req.query?.path === routePath) delete req.query.path;
  return app(req, res);
}
