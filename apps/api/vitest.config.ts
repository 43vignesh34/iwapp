import { defineConfig } from 'vitest/config';

// `pnpm test`: fast unit tests, no Docker. Integration tests (*.int.test.ts) have their own config.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/*.int.test.ts', '**/node_modules/**'],
  },
});
