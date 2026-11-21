import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  hashToken,
  newOpaqueToken,
  safeEqual,
  secretKey,
  signAccessToken,
  verifyAccessToken,
} from './tokens.ts';

const key = secretKey('k'.repeat(32));
const claims = {
  userId: '0190a000-0000-7000-8000-000000000001',
  familyId: '0190a000-0000-7000-8000-000000000002',
};

describe('access tokens', () => {
  it('round-trips the claims', async () => {
    expect(await verifyAccessToken(key, await signAccessToken(key, claims))).toEqual(claims);
  });

  it('rejects a token signed with a different secret', async () => {
    const forged = await signAccessToken(secretKey('x'.repeat(32)), claims);
    expect(await verifyAccessToken(key, forged)).toBeNull();
  });

  it('rejects a tampered token', async () => {
    const token = await signAccessToken(key, claims);
    const [h, p, s] = token.split('.');
    const tampered = `${h ?? ''}.${Buffer.from(JSON.stringify({ sub: 'admin' })).toString('base64url')}.${s ?? ''}`;
    expect(p).toBeDefined();
    expect(await verifyAccessToken(key, tampered)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const expired = await new SignJWT({ fam: claims.familyId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setIssuer('iwapp')
      .setAudience('iwapp-api')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(key);
    expect(await verifyAccessToken(key, expired)).toBeNull();
  });

  it('rejects a token for another audience', async () => {
    const other = await new SignJWT({ fam: claims.familyId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setIssuer('iwapp')
      .setAudience('some-other-app')
      .setExpirationTime('5m')
      .sign(key);
    expect(await verifyAccessToken(key, other)).toBeNull();
  });

  it('treats a missing token as no token', async () => {
    expect(await verifyAccessToken(key, undefined)).toBeNull();
  });
});

describe('opaque tokens', () => {
  it('are unique, URL-safe and 256 bits', () => {
    const a = newOpaqueToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newOpaqueToken()).not.toBe(a);
  });

  it('hash deterministically, and the hash is not the token', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toContain('abc');
  });

  it('compare safely', () => {
    expect(safeEqual('same', 'same')).toBe(true);
    expect(safeEqual('same', 'diff')).toBe(false);
    expect(safeEqual('short', 'longer')).toBe(false);
  });
});
