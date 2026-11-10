import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

export const ACCESS_TTL_SECONDS = 15 * 60; // 15 minutes (spec §6)
export const REFRESH_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days, sliding: each refresh renews it

const ISSUER = 'iwapp';
const AUDIENCE = 'iwapp-api';

/** What the access token asserts. Deliberately minimal: identity, not permissions. Permissions
 *  are worked out per request from the database, so they change the moment an admin changes them. */
export interface AccessClaims {
  userId: string;
  /** The session family (one per sign-in). Logout revokes it; each request checks it. */
  familyId: string;
}

export function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(key: Uint8Array, claims: AccessClaims): Promise<string> {
  return new SignJWT({ fam: claims.familyId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${String(ACCESS_TTL_SECONDS)}s`)
    .sign(key);
}

/** Returns the claims, or null if the token is missing, forged, expired or not ours. */
export async function verifyAccessToken(
  key: Uint8Array,
  token: string | undefined,
): Promise<AccessClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'], // never accept "alg: none" or a different algorithm
    });
    const familyId = payload.fam;
    if (typeof payload.sub !== 'string' || typeof familyId !== 'string') return null;
    return { userId: payload.sub, familyId };
  } catch {
    return null;
  }
}

/** 256 random bits, URL-safe. Used for refresh tokens and CSRF tokens. */
export function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** We store only this hash of a refresh token. A stolen database dump yields no usable tokens. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Compares secrets in constant time, so response timing can't reveal how many characters matched. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
