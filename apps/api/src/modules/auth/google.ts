import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/** What we take from a verified Google ID token. */
export interface GoogleIdentity {
  /** Google's permanent account ID. Emails can be renamed or recycled; `sub` never changes. */
  sub: string;
  email: string;
}

/** Turns the `credential` string from Google's sign-in button into a verified identity, or throws. */
export type GoogleVerifier = (credential: string) => Promise<GoogleIdentity>;

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');

/**
 * Verifies a Google ID token (spec §6): signature against Google's published keys (fetched and
 * cached by jose), issuer, audience = OUR client ID (so a token minted for another app is useless
 * here), expiry, and a verified email. Equivalent to google-auth-library's verifyIdToken.
 */
export function createGoogleVerifier(
  clientId: string,
  keys: JWTVerifyGetKey = createRemoteJWKSet(GOOGLE_JWKS_URL),
): GoogleVerifier {
  return async (credential) => {
    const { payload } = await jwtVerify(credential, keys, {
      issuer: GOOGLE_ISSUERS,
      audience: clientId,
      algorithms: ['RS256'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      throw new Error('Google token is missing sub or email');
    }
    if (payload.email_verified !== true) {
      throw new Error('Google has not verified this email address');
    }
    return { sub: payload.sub, email: payload.email.toLowerCase() };
  };
}
