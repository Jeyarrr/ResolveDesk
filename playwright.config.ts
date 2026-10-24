import { defineConfig, devices } from '@playwright/test';
import { randomBytes } from 'node:crypto';
for (const role of ['ADMIN', 'AGENT', 'EMPLOYEE']) {
  process.env[`E2E_${role}_PASSWORD`] ??= randomBytes(24).toString('hex');
}
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  // Scenarios share one seeded database. The operations scenario itself opens three concurrent roles.
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev -w client -- --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: 'http://127.0.0.1:4101' },
      timeout: 60000,
    },
    {
      command: 'npx tsx server/src/test/browser-server.ts',
      url: 'http://127.0.0.1:4101/api/health',
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
