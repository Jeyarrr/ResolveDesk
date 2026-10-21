import { testDatabase } from './database.js';
import { createApp } from '../app.js';
import { seedInputs } from '../db/seed.js';
const secrets = seedInputs.parse({
  SEED_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD,
  SEED_AGENT_PASSWORD: process.env.E2E_AGENT_PASSWORD,
  SEED_EMPLOYEE_PASSWORD: process.env.E2E_EMPLOYEE_PASSWORD,
});
const fixture = await testDatabase(undefined, secrets);
const server = createApp(fixture.db, fixture.config).listen(4100, '127.0.0.1');
function stop() {
  server.close(() => void fixture.engine.close());
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
