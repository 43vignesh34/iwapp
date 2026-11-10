// Gives e2e tests their own database (iwapp_e2e) next to your dev database, then migrates and
// reseeds it, so every run starts from the same known data and never touches your dev data.
import { LOCAL_DATABASE_URL, createDb, runMigrations } from '@iwapp/db';
import { generate, writeSeed } from '@iwapp/seed';
import pg from 'pg';

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? LOCAL_DATABASE_URL.replace(/\/iwapp$/, '/iwapp_e2e');

const admin = new pg.Client({
  connectionString: LOCAL_DATABASE_URL.replace(/\/iwapp$/, '/postgres'),
});
await admin.connect();
const exists = await admin.query('select 1 from pg_database where datname = $1', ['iwapp_e2e']);
if (exists.rowCount === 0) await admin.query('create database iwapp_e2e');
await admin.end();

await runMigrations(E2E_DATABASE_URL);
const { db, pool } = createDb(E2E_DATABASE_URL);
try {
  await writeSeed(db, generate({ size: 'small', seed: 108 }), { reset: true });
} finally {
  await pool.end();
}
console.log('e2e database ready: iwapp_e2e (migrated, seeded with --seed=108)');
