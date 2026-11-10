import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.ts';

export interface DbOptions {
  /** Max open connections. Neon Free allows ~100 in total; Cloud Run runs up to 3 instances. */
  maxConnections?: number;
}

/**
 * One connection pool per process, created at startup and closed on shutdown.
 * Drizzle builds parameterised SQL on top of it: values travel separately from the query text,
 * so user input can never become SQL (spec §6).
 */
export function createDb(databaseUrl: string, options: DbOptions = {}) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: options.maxConnections ?? 10,
    connectionTimeoutMillis: 5_000, // fail fast instead of hanging a request
    idleTimeoutMillis: 30_000,
  });
  const db = drizzle({ client: pool, schema, casing: 'snake_case' });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>['db'];

/** The handle inside `db.transaction(async (tx) => …)`. Repos accept `Db | Tx`, so the
 *  service decides whether a call is part of a transaction. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;
