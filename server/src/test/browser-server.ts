import { startOperations } from '../realtime.js';
import { lifecycleTestDatabase } from './local-postgres.js';
import { createApp } from '../app.js';
import { seedInputs } from '../db/seed.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const secrets = seedInputs.parse({
  SEED_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD,
  SEED_AGENT_PASSWORD: process.env.E2E_AGENT_PASSWORD,
  SEED_EMPLOYEE_PASSWORD: process.env.E2E_EMPLOYEE_PASSWORD,
});
const fixture = await lifecycleTestDatabase(secrets);
const uploadDirectory = await mkdtemp(join(tmpdir(), 'resolvedesk-browser-uploads-'));
const server = createApp(fixture.db, {
  ...fixture.config,
  CLIENT_ORIGIN: 'http://127.0.0.1:5174',
  UPLOAD_DIR: uploadDirectory,
}).listen(4101, '127.0.0.1');
const operations = startOperations(server, fixture.db, {
  ...fixture.config,
  CLIENT_ORIGIN: 'http://127.0.0.1:5174',
});
function stop() {
  void operations.stop().finally(() => fixture.engine.close());
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
