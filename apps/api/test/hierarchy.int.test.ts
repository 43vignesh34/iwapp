import { leadershipPost, membership, orgUnit, person } from '@iwapp/db';
import { generate, writeSeed } from '@iwapp/seed';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDatabase } from './database.ts';

let database: Awaited<ReturnType<typeof freshDatabase>>;
/** People who lead the units these tests create. */
let leaderId: string;
let successorId: string;
beforeAll(async () => {
  database = await freshDatabase();
  const rows = await database.db
    .insert(person)
    .values([
      { legalName: 'Rule Test Leader', displayName: 'Leader', locality: 'Whitefield' },
      { legalName: 'Rule Test Successor', displayName: 'Successor', locality: 'Hoodi' },
    ])
    .returning();
  leaderId = rows[0]?.id ?? '';
  successorId = rows[1]?.id ?? '';
});
afterAll(async () => {
  await database.close();
});

/** The Postgres error behind a failed query: SQLSTATE code and, if any, the constraint name. */
async function pgError(query: Promise<unknown>): Promise<{ code?: string; constraint?: string }> {
  try {
    await query;
    return {};
  } catch (error) {
    const cause = (error as { cause?: { code?: string; constraint?: string } }).cause;
    return { code: cause?.code, constraint: cause?.constraint };
  }
}
async function pgErrorCode(query: Promise<unknown>): Promise<string | undefined> {
  return (await pgError(query)).code;
}

/** Creates a unit and appoints its leader in ONE transaction, as the leader rule requires. */
async function createUnit(values: typeof orgUnit.$inferInsert) {
  return database.db.transaction(async (tx) => {
    const [unit] = await tx.insert(orgUnit).values(values).returning();
    if (!unit) throw new Error('insert failed');
    await tx
      .insert(membership)
      .values({ personId: leaderId, unitId: unit.id, unitKind: unit.kind, role: 'leader' });
    return unit;
  });
}

const activeLeaderOf = (unitId: string) =>
  and(eq(membership.unitId, unitId), eq(membership.role, 'leader'), isNull(membership.endDate));

describe('org_unit tree rules (enforced by Postgres, ADR 0013: circle → sector → BV)', () => {
  it('accepts circle → sector → BV and rejects the old sector → circle order', async () => {
    const circle = await createUnit({ kind: 'circle', name: 'Order test circle' });
    const sector = await createUnit({
      kind: 'sector',
      parentId: circle.id,
      parentKind: 'circle',
      name: 'Order sector',
    });
    expect(
      await pgErrorCode(
        createUnit({
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
    const circle = await createUnit({ kind: 'circle', name: 'Rule test circle' });

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
    await createUnit({ kind: 'circle', name: 'Twin' });
    expect(
      await pgErrorCode(database.db.insert(orgUnit).values({ kind: 'circle', name: 'Twin' })),
    ).toBe('23505'); // unique_violation
  });
});

describe('every level has a leader (deferred constraint triggers, ADR 0014)', () => {
  it('rejects a unit created without a leader', async () => {
    expect(
      await pgError(database.db.insert(orgUnit).values({ kind: 'circle', name: 'Leaderless' })),
    ).toEqual({ code: '23514', constraint: 'org_unit_requires_leader' });
  });

  it('rejects ending a leader with no successor', async () => {
    const unit = await createUnit({ kind: 'circle', name: 'No successor circle' });
    expect(
      await pgError(
        database.db
          .update(membership)
          .set({ endDate: sql`current_date` })
          .where(activeLeaderOf(unit.id)),
      ),
    ).toEqual({ code: '23514', constraint: 'org_unit_requires_leader' });
    expect(await pgError(database.db.delete(membership).where(activeLeaderOf(unit.id)))).toEqual({
      code: '23514',
      constraint: 'org_unit_requires_leader',
    });
  });

  it('accepts a handover in one transaction, and keeps both leaders in the history', async () => {
    const unit = await createUnit({ kind: 'circle', name: 'Handover circle' });
    await database.db.transaction(async (tx) => {
      await tx
        .update(membership)
        .set({ endDate: sql`current_date`, endReason: 'Handover' })
        .where(activeLeaderOf(unit.id));
      await tx
        .insert(membership)
        .values({ personId: successorId, unitId: unit.id, unitKind: 'circle', role: 'leader' });
    });
    const history = await database.db
      .select({ personId: membership.personId, endDate: membership.endDate })
      .from(membership)
      .where(and(eq(membership.unitId, unit.id), eq(membership.role, 'leader')));
    expect(history).toHaveLength(2);
    expect(history.find((h) => h.endDate === null)?.personId).toBe(successorId);
  });

  it('lets an archived unit go without a leader, but not be reactivated without one', async () => {
    const unit = await createUnit({ kind: 'circle', name: 'Archived circle' });
    await database.db.transaction(async (tx) => {
      await tx.update(orgUnit).set({ active: false }).where(eq(orgUnit.id, unit.id));
      await tx
        .update(membership)
        .set({ endDate: sql`current_date` })
        .where(activeLeaderOf(unit.id));
    });
    expect(
      await pgError(
        database.db.update(orgUnit).set({ active: true }).where(eq(orgUnit.id, unit.id)),
      ),
    ).toEqual({ code: '23514', constraint: 'org_unit_requires_leader' });
  });

  it('keeps a leadership post filled: no vacancy, but a handover is fine', async () => {
    await database.db
      .insert(leadershipPost)
      .values({ personId: leaderId, post: 'program_director' });
    const current = and(
      eq(leadershipPost.post, 'program_director'),
      isNull(leadershipPost.endDate),
    );

    expect(
      await pgError(
        database.db
          .update(leadershipPost)
          .set({ endDate: sql`current_date` })
          .where(current),
      ),
    ).toEqual({ code: '23514', constraint: 'leadership_post_requires_holder' });

    await database.db.transaction(async (tx) => {
      await tx
        .update(leadershipPost)
        .set({ endDate: sql`current_date` })
        .where(current);
      await tx.insert(leadershipPost).values({ personId: successorId, post: 'program_director' });
    });
    const [holder] = await database.db.select().from(leadershipPost).where(current);
    expect(holder?.personId).toBe(successorId);
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
