import { appUser } from '@iwapp/db';
import { TEST_USERS } from '@iwapp/seed';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seededApp } from '../../../test/app.ts';
import type { GoogleIdentity } from './google.ts';

// A stand-in for Google: credentials are "good:<sub>:<email>" or anything else (rejected).
// The real verifier is unit-tested in google.test.ts with real RS256 signatures.
function fakeGoogle(credential: string): Promise<GoogleIdentity> {
  const [kind, sub, email] = credential.split(':');
  if (kind !== 'good' || !sub || !email) return Promise.reject(new Error('bad token'));
  return Promise.resolve({ sub, email });
}

let ctx: Awaited<ReturnType<typeof seededApp>>;
beforeAll(async () => {
  ctx = await seededApp({ verifyGoogleToken: fakeGoogle });
});
afterAll(async () => {
  await ctx.close();
});

const google = (credential: string) =>
  ctx.app.inject({ method: 'POST', url: '/api/v1/auth/google', payload: { credential } });
const userByEmail = async (email: string) =>
  (await ctx.database.db.select().from(appUser).where(eq(appUser.email, email)))[0];

describe('POST /api/v1/auth/google', () => {
  it('first sign-in of an invited user links the Google account and starts a session', async () => {
    const res = await google(`good:g-member:${TEST_USERS.member.email}`);
    expect(res.statusCode).toBe(204);
    expect(res.cookies.map((c) => c.name).sort()).toEqual(['iw_access', 'iw_csrf', 'iw_refresh']);
    expect((await userByEmail(TEST_USERS.member.email))?.googleSub).toBe('g-member');
  });

  it('a returning user is recognised by Google sub even after changing their Google email', async () => {
    const res = await google('good:g-member:renamed@example.com');
    expect(res.statusCode).toBe(204);
  });

  it('refuses an invite already linked to a different Google account', async () => {
    const res = await google(`good:g-someone-else:${TEST_USERS.member.email}`);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'ACCOUNT_MISMATCH' });
  });

  it('refuses a Google account with no invite, and creates nothing', async () => {
    const res = await google('good:g-new:stranger@example.com');
    expect(res.json()).toMatchObject({ status: 403, code: 'NOT_INVITED' });
    expect(await userByEmail('stranger@example.com')).toBeUndefined();
  });

  it('rejects a token that fails verification with 401 GOOGLE_TOKEN_INVALID', async () => {
    const res = await google('forged-token');
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'GOOGLE_TOKEN_INVALID' });
  });

  it('validates the body', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/google', payload: {} });
    expect(res.json()).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
  });
});

describe('sign-in rate limit (spec §6: 10 per minute per IP)', () => {
  it('returns 429 on the 11th attempt within a minute', async () => {
    const limited = await seededApp({ verifyGoogleToken: fakeGoogle });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        const res = await limited.app.inject({
          method: 'POST',
          url: '/api/v1/auth/google',
          payload: { credential: 'forged' },
        });
        statuses.push(res.statusCode);
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
    } finally {
      await limited.close();
    }
  });
});
