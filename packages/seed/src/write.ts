import { appUser, membership, orgUnit, person, userSession, type Db } from '@iwapp/db';
import { sql } from 'drizzle-orm';
import type { SeedData } from './generate.ts';

/** Rows per INSERT. Postgres allows 65,535 parameters per statement; ~13 columns × 1,000 is safe. */
const CHUNK = 1_000;

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

export interface WriteOptions {
  /** Delete existing people, units, memberships and users first. audit_log is append-only and kept. */
  reset?: boolean;
}

/**
 * Writes generated data in ONE transaction: either the whole congregation appears, or nothing
 * does. Refuses to write into a database that already has people, unless `reset` is set.
 */
export async function writeSeed(db: Db, data: SeedData, options: WriteOptions = {}) {
  await db.transaction(async (tx) => {
    if (options.reset) {
      // Children before parents, so no foreign key is ever left dangling.
      await tx.delete(userSession);
      await tx.delete(appUser);
      await tx.delete(membership);
      await tx.delete(orgUnit); // one statement: Postgres checks the self-reference at the end
      await tx.delete(person);
    } else {
      const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(person);
      if ((row?.n ?? 0) > 0) {
        throw new Error('Database already has people. Re-run with --reset to replace them.');
      }
    }
    for (const rows of chunks(data.people)) await tx.insert(person).values(rows);
    for (const rows of chunks(data.orgUnits)) await tx.insert(orgUnit).values(rows); // parents first
    for (const rows of chunks(data.memberships)) await tx.insert(membership).values(rows);
    for (const rows of chunks(data.appUsers)) await tx.insert(appUser).values(rows);
  });
}
