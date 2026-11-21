import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

/** db/migrations, from both src/ (dev) and dist/ (built): each is one level below db/. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

/**
 * Applies every migration not yet recorded in drizzle.__drizzle_migrations, in order, each in
 * its own transaction. Safe to run repeatedly. Production runs it from the deploy pipeline
 * before the new API revision takes traffic (spec §11).
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}
