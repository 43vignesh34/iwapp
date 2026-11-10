import { defineConfig } from 'drizzle-kit';

// `pnpm --filter @iwapp/db generate` compares src/schema with the existing migrations and writes
// a new SQL migration for the difference. Always read the SQL before committing it.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  casing: 'snake_case', // TS `legalName` ↔ SQL `legal_name` (CLAUDE.md naming rule)
});
