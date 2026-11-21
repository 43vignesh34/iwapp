import type { DbOrTx } from '@iwapp/db';
import { sql } from 'drizzle-orm';

/**
 * Every unit a person leads (as leader or co-leader), plus every unit below those, at any depth.
 * This is a leader's SCOPE (spec §6): the members they may see and manage.
 *
 * A recursive CTE has two parts joined by UNION:
 *   1. the anchor: units where this person currently has a leader/co-leader membership;
 *   2. the recursive step: children of any unit already found. Postgres repeats step 2 until it
 *      finds nothing new. UNION (not UNION ALL) drops duplicates, so overlapping leaderships
 *      (say, a circle leader who also co-leads one of its BVs) can't produce repeats or loops.
 */
export async function scopeUnitIds(db: DbOrTx, personId: string): Promise<string[]> {
  const result = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE scope AS (
      SELECT u.id
      FROM org_unit u
      JOIN membership m ON m.unit_id = u.id
      WHERE m.person_id = ${personId}
        AND m.role IN ('leader', 'co_leader')
        AND m.end_date IS NULL
        AND u.active
      UNION
      SELECT child.id
      FROM org_unit child
      JOIN scope parent ON child.parent_id = parent.id
      WHERE child.active
    )
    SELECT id FROM scope
  `);
  return result.rows.map((r) => r.id);
}

/** The units a person is an active member of (any role). Used to decide if they're in a scope. */
export async function activeUnitIdsOf(db: DbOrTx, personId: string): Promise<string[]> {
  const result = await db.execute<{ unit_id: string }>(sql`
    SELECT unit_id FROM membership WHERE person_id = ${personId} AND end_date IS NULL
  `);
  return result.rows.map((r) => r.unit_id);
}
