import { startOperations } from './realtime.js';
import { createApp } from './app.js';
import { readConfig } from './config/env.js';
import { connectDatabase } from './db/connection.js';
import type { Server } from 'node:http';
const env = readConfig();
const { db, pool } = connectDatabase(env);
try {
  await pool.query('select 1');
} catch {
  console.error('Database unavailable. Check server/.env and network access.');
  await pool.end();
  process.exit(1);
}
const server: Server = createApp(db, env).listen(env.PORT, env.HOST);
try {
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  console.error(
    code === 'EADDRINUSE'
      ? `Port ${env.PORT} is already in use. Stop the existing server before starting another copy.`
      : `API startup failed (${code ?? 'unknown error'}).`,
  );
  await pool.end();
  process.exit(1);
}
console.log(`ResolveDesk API listening on port ${env.PORT}`);
const operations = startOperations(server, db, env);
server.on('error', (error) => {
  console.error('API startup failed:', error.name);
  void pool.end();
  process.exitCode = 1;
});
function shutdown() {
  void operations.stop().finally(() => pool.end());
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
