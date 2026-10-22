import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    // Bound parallel PGlite/jsdom workers to avoid memory pressure on local development machines.
    maxWorkers: 2,
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
