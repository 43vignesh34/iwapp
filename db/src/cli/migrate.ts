// `pnpm db:migrate`: applies pending migrations to DATABASE_URL (default: the local Compose DB).
import { runMigrations } from '../migrate.ts';
import { LOCAL_DATABASE_URL } from '../local.ts';

const url = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const target = new URL(url);
console.log(`Migrating ${target.hostname}:${target.port}${target.pathname} …`);
await runMigrations(url);
console.log('Migrations applied.');
