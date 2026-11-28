import { membership, orgUnit, person } from '@iwapp/db';
import { generate, writeSeed } from '@iwapp/seed';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDatabase } from './database.ts';

let database: Awaited<ReturnType<typeof freshDatabase>>;
beforeAll(async () => {
  database = await freshDatabase();
});
afterAll(async () => {
  await database.close();
});

async function pgErrorCode(query: Promise<unknown>): Promise<string | undefined> {
  try {
    await query;
    return undefined;
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code;
  }
}

describe('org_unit tree rules (enforced by Postgres, ADR 0013: circle → sector → BV)', () => {
  it('accepts circle → sector → BV and rejects the old sector → circle order', async () => {
    const [circle] = await database.db
      .insert(orgUnit)
      .values({ kind: 'circle', name: 'Order test circle' })
      .returning();
    if (!circle) throw new Error('circle insert failed');

    const [sector] = await database.db
      .insert(orgUnit)
      .values({ kind: 'sector', parentId: circle.id, parentKind: 'circle', name: 'Order sector' })
      .returning();
    if (!sector) throw new Error('sector insert failed');

    expect(
      await pgErrorCode(
        database.db.insert(orgUnit).values({
          kind: 'bhakti_vriksha',
          parentId: sector.id,
          parentKind: 'sector',
          name: 'Order BV',
        }),
      ),
    ).toBeUndefined();

    // The old order is now illegal: a circle can't sit under a sector, and a sector can't be a root.
    expect(
      await pgErrorCode(
        database.db.insert(orgUnit).values({
          kind: 'circle',
          parentId: sector.id,
          parentKind: 'sector',
          name: 'Upside-down circle',
        }),
      ),
    ).toBe('23514'); // check_violation
    expect(
      await pgErrorCode(
        database.db.insert(orgUnit).values({ kind: 'sector', name: 'Root sector' }),
      ),
    ).toBe('23514');
  });

  it('rejects a BV directly under a circle, even if it lies about the parent kind', async () => {
    const [circle] = await database.db
      .insert(orgUnit)
      .values({ kind: 'circle', name: 'Rule test circle' })
      .returning();
    if (!circle) throw new Error('insert failed');

    // Honest about the parent kind → the CHECK constraint rejects the combination.
    expect(
      await pgErrorCode(
        database.db.insert(orgUnit).values({
          kind: 'bhakti_vriksha',
          parentId: circle.id,
          parentKind: 'circle',
          name: 'Bad BV',
        }),
      ),
    ).toBe('23514'); // check_violation

    // Claims the parent is a sector → the composite foreign key finds no such (id, kind).
    expect(
      await pgErrorCode(
        database.db.insert(orgUnit).values({
          kind: 'bhakti_vriksha',
          parentId: circle.id,
          parentKind: 'sector',
          name: 'Lying BV',
        }),
      ),
    ).toBe('23503'); // foreign_key_violation
  });

  it('rejects two circles with the same name (NULLS NOT DISTINCT)', async () => {
    await database.db.insert(orgUnit).values({ kind: 'circle', name: 'Twin' });
    expect(
      await pgErrorCode(database.db.insert(orgUnit).values({ kind: 'circle', name: 'Twin' })),
    ).toBe('23505'); // unique_violation
  });
});

describe('the seed', () => {
  it('writes a congregation that satisfies every constraint', async () => {
    const data = generate({ size: 'small', seed: 108 });
    await writeSeed(database.db, data, { reset: true });
    const [counts] = await database.db
      .select({
        people: sql<number>`(select count(*)::int from ${person})`,
        units: sql<number>`(select count(*)::int from ${orgUnit})`,
        memberships: sql<number>`(select count(*)::int from ${membership})`,
      })
      .from(sql`(select 1) as one`);
    expect(counts).toEqual({
      people: 300,
      units: 48,
      memberships: data.memberships.length,
    });
  });

  it('enforces one active BV per person (Q3)', async () => {
    const [someone] = await database.db
      .select({ personId: membership.personId })
      .from(membership)
      .where(sql`${membership.role} = 'member' and ${membership.unitKind} = 'bhakti_vriksha'`)
      .limit(1);
    const [otherBv] = await database.db
      .select({ id: orgUnit.id })
      .from(orgUnit)
      .where(
        sql`${orgUnit.kind} = 'bhakti_vriksha' and not exists (
        select 1 from ${membership} m where m.unit_id = ${orgUnit.id} and m.person_id = ${someone?.personId ?? null})`,
      )
      .limit(1);
    if (!someone || !otherBv) throw new Error('fixture missing');

    expect(
      await pgErrorCode(
        database.db.insert(membership).values({
          personId: someone.personId,
          unitId: otherBv.id,
          unitKind: 'bhakti_vriksha',
          role: 'member',
        }),
      ),
    ).toBe('23505'); // unique_violation on membership_one_active_bv
  });
});
