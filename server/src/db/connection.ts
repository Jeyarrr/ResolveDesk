import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import type { Config } from '../config/env.js';
export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Executor = Database | Transaction;
export function connectDatabase(config: Config) {
  const url = new URL(config.DATABASE_URL);
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  const pool = new pg.Pool({
    connectionString: url.toString(),
    max: config.DB_POOL_MAX,
    idleTimeoutMillis: config.SERVERLESS ? 5_000 : 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    ssl: config.DB_SSL ? { rejectUnauthorized: true } : false,
  });
  pool.on('error', () => console.error('Database connection interrupted'));
  return { db: drizzle(pool, { schema }), pool };
}
