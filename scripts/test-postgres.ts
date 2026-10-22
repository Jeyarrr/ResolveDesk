import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { readConfig } from '../server/src/config/env.js';

const config = readConfig();
const url = new URL(config.DATABASE_URL);
if (
  config.NODE_ENV !== 'development' ||
  !['127.0.0.1', 'localhost'].includes(url.hostname) ||
  config.DB_SSL
)
  throw new Error(
    'This runner requires the existing local development PostgreSQL configuration (DB_SSL=false).',
  );
const browser = process.argv[2] === 'browser';
const suites = browser ? [null] : ['server/src/lifecycle.test.ts', 'server/src/assignment.test.ts'];
for (const suite of suites) {
  // Separate suites preserve seeded identities without sharing credentials or mutating another suite's records.
  const name = `resolvedesk_test_${Date.now()}_${randomBytes(4).toString('hex')}`;
  const client = new pg.Client({ connectionString: config.DATABASE_URL, ssl: false });
  try {
    await client.connect();
    await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
  url.pathname = '/' + name;
  console.log(
    `Using isolated local test database: ${name}. The application database is unchanged.`,
  );
  const entry = browser
    ? '../node_modules/@playwright/test/cli.js'
    : '../node_modules/vitest/vitest.mjs';
  const code = await new Promise<number>((resolve) => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL(entry, import.meta.url)), ...(suite ? ['run', suite] : ['test'])],
      {
        stdio: 'inherit',
        shell: false,
        env: { ...process.env, TEST_DATABASE_URL: url.toString() },
      },
    );
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => {
      console.error('Could not launch test runner');
      resolve(1);
    });
  });
  console.log(`Test database retained for inspection in pgAdmin: ${name}`);
  if (code !== 0) {
    process.exitCode = code;
    break;
  }
}
