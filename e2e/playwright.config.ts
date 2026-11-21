import { defineConfig, devices } from '@playwright/test';

const E2E_DATABASE_URL = 'postgres://iwapp:iwapp@localhost:5433/iwapp_e2e';

/**
 * End-to-end tests (spec §10): a real browser against the real API and a production web build.
 * Playwright starts both servers itself. Run with `pnpm e2e` from the repo root.
 */
export default defineConfig({
  testDir: './tests',
  // Tests edit shared seed data (journey 5), so run one at a time: no cross-test races.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0, // a flaky test is a bug to fix, never silently retried (spec §10)
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Leaders mostly use phones (spec A8): every journey also runs at 360 px wide.
    {
      name: 'phone-360',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 } },
    },
  ],
  webServer: [
    {
      command: 'node src/server.ts',
      cwd: '../apps/api',
      url: 'http://127.0.0.1:4000/readyz',
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: 'test',
        LOG_LEVEL: 'warn',
        PORT: '4000',
        DATABASE_URL: E2E_DATABASE_URL,
        AUTH_TEST_MODE: 'true',
      },
    },
    {
      // The production build, served with the same /api proxy as dev (vite preview reuses it).
      command: 'pnpm exec vite build && pnpm exec vite preview --port 4173 --strictPort',
      cwd: '../apps/web',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      env: { VITE_TEST_SIGN_IN: 'true' },
    },
  ],
});
