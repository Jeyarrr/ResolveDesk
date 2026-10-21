import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['client/src/**/*.test.{ts,tsx}'],
          setupFiles: ['client/src/test/setup.ts'],
        },
      },
      { test: { name: 'server', environment: 'node', include: ['server/src/**/*.test.ts'] } },
    ],
  },
});
