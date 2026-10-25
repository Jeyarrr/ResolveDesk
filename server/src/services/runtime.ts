import { createHmac } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { ipKeyGenerator } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import type { Database } from '../db/connection.js';
import type { Config } from '../config/env.js';
import { AppError } from '../middleware/errors.js';
import { monitorSla } from './sla.js';
import { processEvents } from './notifications.js';

export async function takeQuota(db: Database, key: string, limit: number, seconds: number) {
  const result = await db.execute<{ count: number }>(sql`
    INSERT INTO runtime_counters (key, count, expires_at)
    VALUES (${key}, 1, now() + ${seconds} * interval '1 second')
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN runtime_counters.expires_at <= now() THEN 1 ELSE runtime_counters.count + 1 END,
      expires_at = CASE WHEN runtime_counters.expires_at <= now()
        THEN now() + ${seconds} * interval '1 second' ELSE runtime_counters.expires_at END
    RETURNING count`);
  return result.rows[0]!.count <= limit;
}

export function sharedLoginLimit(db: Database, config: Config): RequestHandler {
  return async (req, res, next) => {
    const hash = (value: string) =>
      createHmac('sha256', config.SESSION_SECRET).update(value).digest('hex');
    const ip = ipKeyGenerator(req.ip ?? 'unknown');
    const login = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const allowedIp = await takeQuota(db, 'login-ip:' + hash(ip), 100, 900);
    if (!allowedIp) {
      res.set('Retry-After', '900');
      throw new AppError(429, 'Too many login attempts. Try again later.');
    }
    const allowedAccount = await takeQuota(db, 'login-account:' + hash(login), 20, 900);
    if (!allowedAccount) {
      res.set('Retry-After', '900');
      throw new AppError(429, 'Too many login attempts. Try again later.');
    }
    next();
  };
}

export async function runOperations(db: Database) {
  // Database row locks and event keys make retries safe; a shared quota bounds polling work.
  if (!(await takeQuota(db, 'operations-worker', 1, 30))) return;
  await monitorSla(db);
  await processEvents(db);
  await db.execute(sql`DELETE FROM runtime_counters WHERE expires_at < now() - interval '1 day'`);
}
