import { createApp } from './app.js';
import { readConfig } from './config/env.js';
import { connectDatabase } from './db/connection.js';
const env = readConfig();
const { db, pool } = connectDatabase(env);
try {
  await pool.query('select 1');
} catch {
  console.error('Database unavailable. Check server/.env and network access.');
  await pool.end();
  process.exit(1);
}
const server = createApp(db, env).listen(env.PORT, env.HOST, () => {
  console.log(`ResolveDesk API listening on port ${env.PORT}`);
});
server.on('error', (error) => {
  console.error('API startup failed:', error.name);
  void pool.end();
  process.exitCode = 1;
});
function shutdown() {
  server.close(async (error) => {
    if (error) process.exitCode = 1;
    await pool.end();
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
