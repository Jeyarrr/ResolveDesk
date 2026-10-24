import type { RequestHandler } from 'express';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
export function healthController(db: Database): RequestHandler {
  return async (_req, res) => {
    await db.execute(sql`select 1`);
    res.json({
      success: true,
      data: {
        status: 'ok',
        service: 'resolvedesk-api',
        phase: 4,
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
      },
    });
  };
}
