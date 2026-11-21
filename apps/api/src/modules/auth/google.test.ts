import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createGoogleVerifier } from './google.ts';

const CLIENT_ID = 'iwapp-test.apps.googleusercontent.com';
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let verify: ReturnType<typeof createGoogleVerifier>;

// We play Google: make our own RS256 key pair, publish its public half as a local JWKS, and sign
// tokens with the private half. The verifier code under test is exactly what production runs.
beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
  verify = createGoogleVerifier(CLIENT_ID, createLocalJWKSet({ keys: [jwk] }));
});

function googleToken(
  claims: Record<string, unknown>,
  over: { aud?: string; iss?: string; exp?: number } = {},
) {
  return new SignJWT({ email: 'Radha@Example.com', email_verified: true, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setSubject('google-123')
    .setIssuer(over.iss ?? 'https://accounts.google.com')
    .setAudience(over.aud ?? CLIENT_ID)
    .setExpirationTime(over.exp ?? '5m')
    .sign(privateKey);
}

describe('Google ID token verification', () => {
  it('accepts a valid token and lower-cases the email', async () => {
    expect(await verify(await googleToken({}))).toEqual({
      sub: 'google-123',
      email: 'radha@example.com',
    });
  });

  it('rejects a token issued for another app (audience)', async () => {
    await expect(verify(await googleToken({}, { aud: 'someone-else' }))).rejects.toThrow();
  });

  it('rejects a token not issued by Google', async () => {
    await expect(verify(await googleToken({}, { iss: 'https://evil.example' }))).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    await expect(
      verify(await googleToken({}, { exp: Math.floor(Date.now() / 1000) - 60 })),
    ).rejects.toThrow();
  });

  it('rejects an unverified email', async () => {
    await expect(verify(await googleToken({ email_verified: false }))).rejects.toThrow(/verified/);
  });
});
