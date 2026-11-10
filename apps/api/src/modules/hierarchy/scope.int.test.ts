import { appUser, membership, orgUnit } from '@iwapp/db';
import { TEST_USERS } from '@iwapp/seed';
import { and, eq, isNull } from 'drizzle-orm';
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

  it('a circle leader sees the circle and its three BVs', async () => {
    const ids = await scopeUnitIds(
      ctx.database.db,
      await personIdOf(TEST_USERS.circleLeader.email),
    );
    expect(await unitNames(ids)).toEqual([
      'Circle 1.1',
      'Dwarka Bhakti Vriksha',
      'Govardhan Bhakti Vriksha',
      'Puri Bhakti Vriksha',
    ]);
  });

  it('a sector leader sees the sector, 3 circles and 9 BVs (recursion goes two levels down)', async () => {
    const [sectorLead] = await ctx.database.db
      .select({ personId: membership.personId })
      .from(membership)
      .innerJoin(orgUnit, eq(orgUnit.id, membership.unitId))
      .where(
        and(
          eq(orgUnit.name, 'Sector 1'),
          eq(membership.role, 'leader'),
          isNull(membership.endDate),
        ),
      );
    if (!sectorLead) throw new Error('no sector leader');
    expect(await scopeUnitIds(ctx.database.db, sectorLead.personId)).toHaveLength(13);
  });

  it('an ended leadership no longer counts', async () => {
    const leaderId = await personIdOf(TEST_USERS.otherLeader.email);
    await ctx.database.db
      .update(membership)
      .set({ endDate: '2026-11-01' })
      .where(and(eq(membership.personId, leaderId), eq(membership.role, 'leader')));
    expect(await scopeUnitIds(ctx.database.db, leaderId)).toEqual([]);
    await ctx.database.db
      .update(membership)
      .set({ endDate: null })
      .where(and(eq(membership.personId, leaderId), eq(membership.role, 'leader')));
  });
});
