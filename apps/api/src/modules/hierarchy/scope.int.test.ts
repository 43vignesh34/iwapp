import { appUser, leadershipPost, membership, orgUnit } from '@iwapp/db';
import { TEST_USERS } from '@iwapp/seed';
import { and, eq, isNull, TransactionRollbackError } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seededApp } from '../../../test/app.ts';
import { scopeUnitIds } from './repo.ts';

let ctx: Awaited<ReturnType<typeof seededApp>>;
beforeAll(async () => {
  ctx = await seededApp();
});
afterAll(async () => {
  await ctx.close();
});

async function personIdOf(email: string) {
  const [row] = await ctx.database.db.select().from(appUser).where(eq(appUser.email, email));
  if (!row) throw new Error(`no user ${email}`);
  return row.personId;
}
async function unitNames(ids: string[]) {
  const all = await ctx.database.db.select().from(orgUnit);
  return all
    .filter((u) => ids.includes(u.id))
    .map((u) => u.name)
    .sort();
}

describe('scopeUnitIds (recursive CTE over org_unit)', () => {
  it('a member who leads nothing has an empty scope', async () => {
    expect(await scopeUnitIds(ctx.database.db, await personIdOf(TEST_USERS.member.email))).toEqual(
      [],
    );
  });

  it('a BV leader sees exactly their BV', async () => {
    const ids = await scopeUnitIds(ctx.database.db, await personIdOf(TEST_USERS.bvLeader.email));
    expect(await unitNames(ids)).toEqual(['Dwarka Bhakti Vriksha']);
  });

  it('a sector leader sees the sector and its four BVs', async () => {
    const [sectorLead] = await ctx.database.db
      .select({ personId: membership.personId })
      .from(membership)
      .innerJoin(orgUnit, eq(orgUnit.id, membership.unitId))
      .where(
        and(
          eq(orgUnit.name, 'Sector 1.1'),
          eq(membership.role, 'leader'),
          isNull(membership.endDate),
        ),
      );
    if (!sectorLead) throw new Error('no sector leader');
    const ids = await scopeUnitIds(ctx.database.db, sectorLead.personId);
    expect(await unitNames(ids)).toEqual([
      'Dwarka Bhakti Vriksha',
      'Govardhan Bhakti Vriksha',
      'Puri Bhakti Vriksha',
      'Sector 1.1',
      'Vrindavan Bhakti Vriksha',
    ]);
  });

  it('a circle leader sees the circle, 3 sectors and 12 BVs (recursion goes two levels down)', async () => {
    const ids = await scopeUnitIds(
      ctx.database.db,
      await personIdOf(TEST_USERS.circleLeader.email),
    );
    expect(ids).toHaveLength(16);
    expect(await unitNames(ids)).toEqual(
      expect.arrayContaining(['Circle 1', 'Sector 1.3', 'Dwarka Bhakti Vriksha']),
    );
  });

  it('the Supervising Preacher and the Program Director see the whole tree (ADR 0013)', async () => {
    const preacherIds = await scopeUnitIds(
      ctx.database.db,
      await personIdOf(TEST_USERS.preacher.email),
    );
    expect(preacherIds).toHaveLength(48);

    const [director] = await ctx.database.db
      .select({ personId: leadershipPost.personId })
      .from(leadershipPost)
      .where(and(eq(leadershipPost.post, 'program_director'), isNull(leadershipPost.endDate)));
    if (!director) throw new Error('no program director');
    expect(await scopeUnitIds(ctx.database.db, director.personId)).toHaveLength(48);
  });

  it('an archived circle drops out of a post holder scope, with everything under it', async () => {
    const preacherId = await personIdOf(TEST_USERS.preacher.email);
    await ctx.database.db
      .update(orgUnit)
      .set({ active: false })
      .where(eq(orgUnit.name, 'Circle 3'));
    expect(await scopeUnitIds(ctx.database.db, preacherId)).toHaveLength(32);
    await ctx.database.db.update(orgUnit).set({ active: true }).where(eq(orgUnit.name, 'Circle 3'));
  });

  // Ending a leadership without a successor can't COMMIT (ADR 0014). These two tests only need
  // to see the scope mid-transaction, so they roll back: the deferred check never runs, and the
  // shared seeded data is left untouched.
  it('an ended leadership no longer counts', async () => {
    const leaderId = await personIdOf(TEST_USERS.otherLeader.email);
    const attempt = ctx.database.db.transaction(async (tx) => {
      await tx
        .update(membership)
        .set({ endDate: '2026-11-01' })
        .where(and(eq(membership.personId, leaderId), eq(membership.role, 'leader')));
      expect(await scopeUnitIds(tx, leaderId)).toEqual([]);
      tx.rollback();
    });
    await expect(attempt).rejects.toBeInstanceOf(TransactionRollbackError);
  });

  it('an ended post no longer counts', async () => {
    const preacherId = await personIdOf(TEST_USERS.preacher.email);
    const attempt = ctx.database.db.transaction(async (tx) => {
      await tx
        .update(leadershipPost)
        .set({ endDate: '2026-11-01' })
        .where(eq(leadershipPost.personId, preacherId));
      expect(await scopeUnitIds(tx, preacherId)).toEqual([]);
      tx.rollback();
    });
    await expect(attempt).rejects.toBeInstanceOf(TransactionRollbackError);
  });
});
