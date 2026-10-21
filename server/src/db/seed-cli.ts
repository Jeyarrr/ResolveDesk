import { readConfig } from '../config/env.js';
import { connectDatabase } from './connection.js';
import { seedDevelopment, seedInputs } from './seed.js';
const config = readConfig();
if (config.NODE_ENV !== 'development' || process.env.CONFIRM_DEVELOPMENT_SEED !== 'yes')
  throw new Error(
    'Seeding requires NODE_ENV=development and CONFIRM_DEVELOPMENT_SEED=yes. Use a dedicated development database.',
  );
const secrets = seedInputs.safeParse(process.env);
if (!secrets.success)
  throw new Error(
    'Set all three SEED_*_PASSWORD variables to distinct strong passwords of 12–128 characters.',
  );
if (new Set(Object.values(secrets.data)).size !== 3) throw new Error('Use distinct seed passwords');
const { db, pool } = connectDatabase(config);
try {
  await seedDevelopment(db, secrets.data);
  console.log('Development records created; existing passwords were preserved.');
} catch {
  console.error('Seed failed. Check database connectivity and migrations.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
