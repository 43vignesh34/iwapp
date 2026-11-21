import { defineConfig } from 'vitest/config';

// `pnpm test:int`: tests that need a real Postgres (Docker must be running).
export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts', 'test/**/*.int.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    hookTimeout: 120_000, // the first run pulls the postgres:17 image
    testTimeout: 30_000,
  },
});
