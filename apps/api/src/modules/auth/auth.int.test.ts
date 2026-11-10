import { appUser, auditLog, userSession } from '@iwapp/db';
import { TEST_USERS } from '@iwapp/seed';
import { SESSION_COOKIES } from '@iwapp/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seededApp } from '../../../test/app.ts';
import { absorbCookies, signIn, withSession } from '../../../test/session.ts';

let ctx: Awaited<ReturnType<typeof seededApp>>;
beforeAll(async () => {
  ctx = await seededApp();
});
afterAll(async () => {
  await ctx.close();
});

const me = (jar: Parameters<typeof withSession>[0]) =>
  ctx.app.inject({ method: 'GET', url: '/api/v1/me', ...withSession(jar) });

describe('sign-in (test identity provider)', () => {
  it('sets three cookies with the right security flags', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/test-login',
      payload: { email: TEST_USERS.member.email },
    });
    expect(res.statusCode).toBe(204);
    const byName = Object.fromEntries(res.cookies.map((c) => [c.name, c]));
    for (const name of [SESSION_COOKIES.access, SESSION_COOKIES.refresh]) {
      expect(byName[name]).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict' });
    }
    expect(byName[SESSION_COOKIES.refresh]?.path).toBe('/api/v1/auth');
    // The CSRF cookie must be readable by the web app, so it is NOT HttpOnly.
    expect(byName[SESSION_COOKIES.csrf]?.httpOnly).toBeUndefined();
  });

  it('lets the signed-in user read /me', async () => {
    const res = await me(await signIn(ctx.app, TEST_USERS.member.email));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      user: { email: TEST_USERS.member.email, isAdmin: false },
      person: { displayName: 'Member' },
    });
  });

  it('accepts the email in any case', async () => {
    const jar = await signIn(ctx.app, TEST_USERS.admin.email.toUpperCase());
    expect((await me(jar)).json()).toMatchObject({ user: { isAdmin: true } });
  });

  it('refuses someone who was never invited: no account is created', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/test-login',
      payload: { email: 'stranger@iwapp.test' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      code: 'NOT_INVITED',
      detail: 'Ask an admin to invite you.',
    });
    const rows = await ctx.database.db
      .select()
      .from(appUser)
      .where(eq(appUser.email, 'stranger@iwapp.test'));
    expect(rows).toHaveLength(0);
  });

  it('activates an invited user on first sign-in, and audit-logs it', async () => {
    await ctx.database.db
      .update(appUser)
      .set({ status: 'invited' })
      .where(eq(appUser.email, TEST_USERS.circleLeader.email));
    await signIn(ctx.app, TEST_USERS.circleLeader.email);
    const [user] = await ctx.database.db
      .select()
      .from(appUser)
      .where(eq(appUser.email, TEST_USERS.circleLeader.email));
    expect(user?.status).toBe('active');
    const audits = await ctx.database.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'user.activate'), eq(auditLog.entityId, user?.id ?? '')));
    expect(audits).toHaveLength(1);
  });
});

describe('deny by default', () => {
  it('returns 401 for /api/v1 routes without a session', async () => {
    const res = await me({});
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('returns 401 (not 404) for unknown /api/v1 routes when anonymous', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/no-such-thing' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a forged access cookie', async () => {
    expect((await me({ access: 'eyJhbGciOiJIUzI1NiJ9.e30.forged' })).statusCode).toBe(401);
  });
});

describe('CSRF (double submit)', () => {
  it('rejects a write without the X-CSRF-Token header', async () => {
    const jar = await signIn(ctx.app, TEST_USERS.member.email);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      ...withSession(jar, { csrf: false }),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'CSRF_FAILED' });
  });

  it('rejects a header that does not match the cookie', async () => {
    const jar = await signIn(ctx.app, TEST_USERS.member.email);
    const opts = withSession(jar);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: opts.cookies,
      headers: { 'x-csrf-token': 'attacker-guess' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('refresh token rotation', () => {
  it('issues a new refresh token and keeps the session working', async () => {
    const jar = await signIn(ctx.app, TEST_USERS.member.email);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      ...withSession(jar),
    });
    expect(res.statusCode).toBe(204);
    const next = absorbCookies(jar, res);
    expect(next.refresh).toBeDefined();
    expect(next.refresh).not.toBe(jar.refresh);
    expect((await me(next)).statusCode).toBe(200);
  });

  it('treats reuse of a rotated token as theft and revokes the whole family', async () => {
    const jar = await signIn(ctx.app, TEST_USERS.member.email);
    const first = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      ...withSession(jar),
    });
    const rotated = absorbCookies(jar, first);

    // An attacker replays the OLD refresh token.
    const replay = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      ...withSession(jar),
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json()).toMatchObject({ code: 'SESSION_REUSED' });

    // Now even the legitimate, newest tokens are dead.
    const legit = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      ...withSession(rotated),
    });
    expect(legit.statusCode).toBe(401);
    expect((await me(rotated)).statusCode).toBe(401);
  });

  it('stores only hashes of refresh tokens', async () => {
    const jar = await signIn(ctx.app, TEST_USERS.member.email);
    const rows = await ctx.database.db.select({ hash: userSession.refreshHash }).from(userSession);
    expect(rows.some((r) => r.hash === jar.refresh)).toBe(false);
  });
});

describe('logout and disabling', () => {
  it('logout revokes every session of the user, at once', async () => {
    const phone = await signIn(ctx.app, TEST_USERS.bvLeader.email);
    const laptop = await signIn(ctx.app, TEST_USERS.bvLeader.email);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      ...withSession(laptop),
    });
    expect(res.statusCode).toBe(204);
    // The phone's access token is still unexpired, but the session check rejects it.
    expect((await me(phone)).statusCode).toBe(401);
    const live = await ctx.database.db
      .select()
      .from(userSession)
      .innerJoin(appUser, eq(appUser.id, userSession.userId))
      .where(and(eq(appUser.email, TEST_USERS.bvLeader.email), isNull(userSession.revokedAt)));
    expect(live).toHaveLength(0);
  });

  it('a disabled user is locked out immediately and cannot sign in again', async () => {
    const jar = await signIn(ctx.app, TEST_USERS.admin.email);
    await ctx.database.db
      .update(appUser)
      .set({ status: 'disabled' })
      .where(eq(appUser.email, TEST_USERS.admin.email));
    expect((await me(jar)).statusCode).toBe(401);
    const again = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/test-login',
      payload: { email: TEST_USERS.admin.email },
    });
    expect(again.json()).toMatchObject({ code: 'ACCOUNT_DISABLED' });
    await ctx.database.db
      .update(appUser)
      .set({ status: 'active' })
      .where(eq(appUser.email, TEST_USERS.admin.email));
  });
});

describe('test identity provider', () => {
  it('does not exist when AUTH_TEST_MODE is off', async () => {
    const { buildApp } = await import('../../app.ts');
    const { loadEnv } = await import('../../config/env.ts');
    const plain = await buildApp(loadEnv({ NODE_ENV: 'test', DATABASE_URL: ctx.database.url }));
    const res = await plain.inject({
      method: 'POST',
      url: '/api/v1/auth/test-login',
      payload: { email: TEST_USERS.admin.email },
    });
    await plain.close();
    expect(res.statusCode).toBe(401); // unknown /api/v1 route → deny by default
  });
});
