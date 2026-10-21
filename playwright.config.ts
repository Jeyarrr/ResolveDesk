import { defineConfig, devices } from '@playwright/test';
import { randomBytes } from 'node:crypto';
for (const role of ['ADMIN', 'AGENT', 'EMPLOYEE']) {
  process.env[`E2E_${role}_PASSWORD`] ??= randomBytes(24).toString('hex');
}
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 2,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev -w client',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: 'http://127.0.0.1:4100' },
      timeout: 60000,
    },
    {
      command: 'npx tsx server/src/test/browser-server.ts',
      url: 'http://127.0.0.1:4100/api/health',
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
