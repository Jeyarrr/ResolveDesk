import { describe, expect, it } from 'vitest';
import { readConfig } from './config/env.js';
import { randomBytes } from 'node:crypto';
describe('startup configuration', () => {
  it('rejects missing database credentials and secrets', () =>
    expect(() => readConfig({})).toThrow('Invalid server configuration'));
  it('rejects insecure production configuration', () =>
    expect(() =>
      readConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://unused/test',
        SESSION_SECRET: randomBytes(32).toString('hex'),
        DB_SSL: 'false',
      }),
    ).toThrow());
});
