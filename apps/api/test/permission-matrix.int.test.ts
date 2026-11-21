/**
 * THE PERMISSION MATRIX (spec §10): every /api/v1 endpoint × every role → the expected status.
 * It must pass on every PR. A new endpoint without rows here fails the coverage test at the
 * bottom, so access rules can't be forgotten (CLAUDE.md: "Every new endpoint adds rows").
 *
 * Personas (all seeded, see packages/seed/src/catalog.ts):
 *   anonymous         no session
 *   member            member@         a member of Dwarka BV; leads nothing
 *   leaderInScope     leader@         leads Dwarka BV, so Dwarka's members are in scope
 *   leaderOutOfScope  other-leader@   leads Udupi BV (Sector 2), so Dwarka is out of scope
 *   admin             admin@
 */
import { appUser, person } from '@iwapp/db';
import { TEST_USERS } from '@iwapp/seed';
import { eq, notInArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seededApp } from './app.ts';
import { signIn, withSession, type CookieJar } from './session.ts';

type Persona = 'anonymous' | 'member' | 'leaderInScope' | 'leaderOutOfScope' | 'admin';
const PERSONAS: Persona[] = ['anonymous', 'member', 'leaderInScope', 'leaderOutOfScope', 'admin'];
const EMAIL: Record<Exclude<Persona, 'anonymous'>, string> = {
  member: TEST_USERS.member.email,
  leaderInScope: TEST_USERS.bvLeader.email,
  leaderOutOfScope: TEST_USERS.otherLeader.email,
  admin: TEST_USERS.admin.email,
};

/** Things rows can refer to, found in the seeded database. */
interface Fixtures {
  /** The person behind member@ (in Dwarka): the "target" for member endpoints from S7 on. */
  dwarkaMemberId: string;
  /** Returns a different person without a login each call (for invites). */
  nextPersonWithoutLogin: () => string;
  /** The person's current version, for If-Match (it changes as rows succeed). */
  versionOf: (personId: string) => Promise<number>;
}

interface MatrixRow {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** The route pattern, exactly as in the OpenAPI document (for the coverage check). */
  route: string;
  url: (fx: Fixtures) => string;
  body?: (fx: Fixtures) => object;
  headers?: (fx: Fixtures) => Promise<Record<string, string>>;
  expect: Record<Persona, number>;
}

const ALL_SIGNED_IN = (status: number, anonymous = 401): Record<Persona, number> => ({
  anonymous,
  member: status,
  leaderInScope: status,
  leaderOutOfScope: status,
  admin: status,
});
const ADMIN_ONLY = (status: number): Record<Persona, number> => ({
  anonymous: 401,
  member: 403,
  leaderInScope: 403,
  leaderOutOfScope: 403,
  admin: status,
});

export const MATRIX: MatrixRow[] = [
  { method: 'GET', route: '/api/v1/me', url: () => '/api/v1/me', expect: ALL_SIGNED_IN(200) },
  {
    method: 'POST',
    route: '/api/v1/auth/refresh',
    url: () => '/api/v1/auth/refresh',
    // Public, but still CSRF-protected because it changes server state. A caller with no
    // cookies at all fails the CSRF check first (403). A real browser whose access token expired
    // still holds the 14-day iw_csrf cookie, so it gets past CSRF to the refresh logic.
    expect: ALL_SIGNED_IN(204, 403),
  },
  {
    method: 'POST',
    route: '/api/v1/auth/logout',
    url: () => '/api/v1/auth/logout',
    expect: ALL_SIGNED_IN(204),
  },
  { method: 'GET', route: '/api/v1/users', url: () => '/api/v1/users', expect: ADMIN_ONLY(200) },
  {
    method: 'POST',
    route: '/api/v1/users',
    url: () => '/api/v1/users',
    body: (fx) => ({
      email: `invite-${crypto.randomUUID()}@example.com`,
      personId: fx.nextPersonWithoutLogin(),
    }),
    expect: ADMIN_ONLY(201),
  },
  {
    method: 'GET',
    route: '/api/v1/members',
    url: () => '/api/v1/members',
    // Leaders list their own scope (out-of-scope leaders still get 200, with their own members).
    expect: { anonymous: 401, member: 403, leaderInScope: 200, leaderOutOfScope: 200, admin: 200 },
  },
  {
    method: 'GET',
    route: '/api/v1/members/{id}',
    url: (fx) => `/api/v1/members/${fx.dwarkaMemberId}`,
    expect: { anonymous: 401, member: 200, leaderInScope: 200, leaderOutOfScope: 403, admin: 200 },
  },
  {
    method: 'PATCH',
    route: '/api/v1/members/{id}',
    url: (fx) => `/api/v1/members/${fx.dwarkaMemberId}`,
    body: () => ({ locality: `Matrix ${crypto.randomUUID().slice(0, 8)}` }),
    headers: async (fx) => ({ 'if-match': `"${String(await fx.versionOf(fx.dwarkaMemberId))}"` }),
    // Self and admins only: leaders editing contact details waits on open question Q2.
    expect: { anonymous: 401, member: 200, leaderInScope: 403, leaderOutOfScope: 403, admin: 200 },
  },
];

/** Sign-in endpoints have no "signed-in persona" to test; they have their own suites. */
const NOT_IN_MATRIX = new Set(['POST /api/v1/auth/test-login', 'POST /api/v1/auth/google']);

let ctx: Awaited<ReturnType<typeof seededApp>>;
let fx: Fixtures;
beforeAll(async () => {
  ctx = await seededApp();
  const [member] = await ctx.database.db
    .select()
    .from(appUser)
    .where(eq(appUser.email, TEST_USERS.member.email));
  const withLogin = ctx.database.db.select({ id: appUser.personId }).from(appUser);
  const spare = await ctx.database.db
    .select({ id: person.id })
    .from(person)
    .where(notInArray(person.id, withLogin))
    .limit(50);
  let next = 0;
  fx = {
    dwarkaMemberId: member?.personId ?? '',
    nextPersonWithoutLogin: () => spare[next++]?.id ?? '',
    versionOf: async (personId) => {
      const [row] = await ctx.database.db
        .select({ v: person.version })
        .from(person)
        .where(eq(person.id, personId));
      return row?.v ?? 0;
    },
  };
});
afterAll(async () => {
  await ctx.close();
});

async function sessionFor(persona: Persona): Promise<CookieJar> {
  // A fresh sign-in per check: logout rows revoke sessions, so nothing may be shared.
  return persona === 'anonymous' ? {} : signIn(ctx.app, EMAIL[persona]);
}

describe.each(MATRIX)('$method $route', (row) => {
  it.each(PERSONAS)('%s', async (persona) => {
    const jar = await sessionFor(persona);
    const session = withSession(jar);
    const res = await ctx.app.inject({
      method: row.method,
      url: row.url(fx),
      ...(row.body ? { payload: row.body(fx) } : {}),
      cookies: session.cookies,
      headers: { ...session.headers, ...(row.headers ? await row.headers(fx) : {}) },
    });
    expect(res.statusCode, res.body).toBe(row.expect[persona]);
  });
});

describe('matrix coverage', () => {
  it('has rows for every /api/v1 endpoint in the OpenAPI document', async () => {
    const doc = (await ctx.app.inject({ method: 'GET', url: '/docs/json' })).json<{
      paths: Record<string, Record<string, unknown>>;
    }>();
    const endpoints = Object.entries(doc.paths).flatMap(([path, ops]) =>
      Object.keys(ops).map((m) => `${m.toUpperCase()} ${path}`),
    );
    const covered = new Set(MATRIX.map((r) => `${r.method} ${r.route}`));
    const missing = endpoints.filter(
      (e) => e.includes(' /api/v1/') && !covered.has(e) && !NOT_IN_MATRIX.has(e),
    );
    expect(missing, 'endpoints with no permission-matrix rows').toEqual([]);
  });
});
