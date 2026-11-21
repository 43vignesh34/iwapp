import { appUser, auditLog, person } from '@iwapp/db';
import { TEST_USERS } from '@iwapp/seed';
import type { MemberDetail, MemberListResponse } from '@iwapp/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seededApp } from '../../../test/app.ts';
import { signIn, withSession, type CookieJar } from '../../../test/session.ts';

let ctx: Awaited<ReturnType<typeof seededApp>>;
const jars: Record<string, CookieJar> = {};
let memberId: string;

beforeAll(async () => {
  ctx = await seededApp();
  for (const [key, u] of Object.entries(TEST_USERS)) jars[key] = await signIn(ctx.app, u.email);
  const [row] = await ctx.database.db
    .select()
    .from(appUser)
    .where(eq(appUser.email, TEST_USERS.member.email));
  memberId = row?.personId ?? '';
});
afterAll(async () => {
  await ctx.close();
});

const get = (who: string, url: string) =>
  ctx.app.inject({ method: 'GET', url, ...withSession(jars[who] ?? {}) });
const patch = (who: string, body: object, ifMatch?: string) => {
  const s = withSession(jars[who] ?? {});
  return ctx.app.inject({
    method: 'PATCH',
    url: `/api/v1/members/${memberId}`,
    payload: body,
    cookies: s.cookies,
    headers: { ...s.headers, ...(ifMatch === undefined ? {} : { 'if-match': ifMatch }) },
  });
};
async function allPages(who: string, limit: number) {
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const res = await get(
      who,
      `/api/v1/members?limit=${String(limit)}${cursor ? `&cursor=${cursor}` : ''}`,
    );
    const body = res.json<MemberListResponse>();
    ids.push(...body.items.map((m) => m.id));
    cursor = body.nextCursor;
  } while (cursor);
  return ids;
}

describe('GET /api/v1/members', () => {
  it('an admin pages through all 300 people, with no duplicates or gaps', async () => {
    const ids = await allPages('admin', 70);
    expect(ids).toHaveLength(300);
    expect(new Set(ids).size).toBe(300);
  });

  it("a BV leader sees exactly their BV's people, filtered in SQL", async () => {
    const items = (await get('bvLeader', '/api/v1/members?limit=100')).json<MemberListResponse>()
      .items;
    expect(items.length).toBeGreaterThan(2);
    expect(new Set(items.map((m) => m.bhaktiVriksha))).toEqual(new Set(['Dwarka Bhakti Vriksha']));
  });

  it("a circle leader sees their circle's three BVs", async () => {
    const ids = await allPages('circleLeader', 100);
    const items = (
      await get('admin', '/api/v1/members?limit=100&q=Test')
    ).json<MemberListResponse>();
    expect(ids.length).toBeGreaterThan(items.items.length);
  });

  it('list rows carry no contact details (data minimisation)', async () => {
    const body = (await get('admin', '/api/v1/members?limit=5')).body;
    expect(body).not.toMatch(/phone|email|@example\.com|\+91/);
  });

  it('searches names case-insensitively, and treats % literally', async () => {
    const hits = (await get('admin', '/api/v1/members?q=test%20bv')).json<MemberListResponse>()
      .items;
    expect(hits.map((m) => m.legalName)).toEqual(['Test BV Leader']);
    const none = (await get('admin', '/api/v1/members?q=%25')).json<MemberListResponse>().items;
    expect(none).toEqual([]);
  });

  it('rejects a tampered cursor with 400', async () => {
    const res = await get('admin', '/api/v1/members?cursor=not-a-cursor');
    expect(res.json()).toMatchObject({ status: 400, code: 'INVALID_CURSOR' });
  });
});

describe('GET /api/v1/members/{id}', () => {
  it('returns the profile with an ETag equal to its version', async () => {
    const res = await get('member', `/api/v1/members/${memberId}`);
    const body = res.json<MemberDetail>();
    expect(res.headers.etag).toBe(`"${String(body.version)}"`);
    expect(body.units).toContainEqual(
      expect.objectContaining({
        name: 'Dwarka Bhakti Vriksha',
        kind: 'bhakti_vriksha',
        role: 'member',
      }),
    );
  });

  it('404s for an unknown id', async () => {
    const res = await get('admin', '/api/v1/members/00000000-0000-7000-8000-000000000000');
    expect(res.json()).toMatchObject({ status: 404, code: 'MEMBER_NOT_FOUND' });
  });
});

describe('PATCH /api/v1/members/{id} (journey 5: a member corrects their own phone)', () => {
  it('normalises the phone, bumps the version, and writes an audit row with the diff', async () => {
    const before = (await get('member', `/api/v1/members/${memberId}`)).json<MemberDetail>();
    const res = await patch('member', { phone: '98765 43210' }, `"${String(before.version)}"`);
    expect(res.statusCode).toBe(200);
    const after = res.json<MemberDetail>();
    expect(after.phoneE164).toBe('+919876543210');
    expect(after.version).toBe(before.version + 1);
    expect(res.headers.etag).toBe(`"${String(after.version)}"`);

    const [audit] = await ctx.database.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'member.update'), eq(auditLog.entityId, memberId)));
    expect(audit?.changes).toEqual({ phoneE164: { old: before.phoneE164, new: '+919876543210' } });
    expect(audit?.requestId).toBe(res.headers['x-request-id']);
  });

  it('412 when someone else saved first: the stale write changes nothing', async () => {
    const current = (await get('member', `/api/v1/members/${memberId}`)).json<MemberDetail>();
    const stale = `"${String(current.version - 1)}"`;
    const res = await patch('member', { locality: 'Varthur' }, stale);
    expect(res.json()).toMatchObject({ status: 412, code: 'VERSION_MISMATCH' });
    const [row] = await ctx.database.db.select().from(person).where(eq(person.id, memberId));
    expect(row?.locality).toBe(current.locality);
  });

  it('428 without If-Match', async () => {
    expect((await patch('member', { locality: 'Hoodi' })).json()).toMatchObject({
      status: 428,
      code: 'IF_MATCH_REQUIRED',
    });
  });

  it('400 for a phone number it cannot read, and for an empty body', async () => {
    const v = (await get('member', `/api/v1/members/${memberId}`)).json<MemberDetail>().version;
    // Long enough to pass the schema (shape), but not a number the domain rule can read.
    expect((await patch('member', { phone: '1234567' }, `"${String(v)}"`)).json()).toMatchObject({
      code: 'INVALID_PHONE',
    });
    // Too short even for the schema: rejected at the edge, before the service runs.
    expect((await patch('member', { phone: '12345' }, `"${String(v)}"`)).json()).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect((await patch('member', {}, `"${String(v)}"`)).json()).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('a save that changes nothing writes nothing and keeps the version', async () => {
    const current = (await get('member', `/api/v1/members/${memberId}`)).json<MemberDetail>();
    const res = await patch(
      'member',
      { locality: current.locality },
      `"${String(current.version)}"`,
    );
    expect(res.json<MemberDetail>().version).toBe(current.version);
  });
});
