import type { Db, Tx } from '@iwapp/db';
import { uuidv7 } from 'uuidv7';
import { AppError } from '../../errors.ts';
import { recordAudit } from '../audit/index.ts';
import type { GoogleIdentity } from './google.ts';
import { matchInvite } from './invite-match.ts';
import * as repo from './repo.ts';
import { REFRESH_TTL_SECONDS, hashToken, newOpaqueToken, signAccessToken } from './tokens.ts';

/** Who is making a request, as every module sees it. Built per request by the auth hook. */
export interface Actor {
  userId: string;
  personId: string;
  email: string;
  isAdmin: boolean;
  displayName: string;
  familyId: string;
}

/** Everything the HTTP layer needs to set the session cookies. */
export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

interface Context {
  key: Uint8Array;
  requestId?: string;
}

async function issue(
  db: Db | Tx,
  ctx: Context,
  userId: string,
  familyId: string,
): Promise<IssuedSession> {
  const refreshToken = newOpaqueToken();
  await repo.insertSession(db, {
    userId,
    familyId,
    refreshHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
  });
  return {
    accessToken: await signAccessToken(ctx.key, { userId, familyId }),
    refreshToken,
    csrfToken: newOpaqueToken(),
  };
}

const REFUSAL_MESSAGES: Record<'NOT_INVITED' | 'ACCOUNT_DISABLED' | 'ACCOUNT_MISMATCH', string> = {
  NOT_INVITED: 'Ask an admin to invite you.',
  ACCOUNT_DISABLED: 'This account has been disabled.',
  ACCOUNT_MISMATCH:
    'This email is linked to a different Google account. Ask an admin to check your invite.',
};

/** Common tail of every sign-in: record the login, activate an invite, start a session family. */
async function startSession(tx: Tx, ctx: Context, userId: string, activate: boolean) {
  await repo.markSignedIn(tx, userId, activate);
  if (activate) {
    await recordAudit(tx, {
      actorId: userId,
      action: 'user.activate',
      entity: 'app_user',
      entityId: userId,
      changes: { status: { old: 'invited', new: 'active' } },
      requestId: ctx.requestId,
    });
  }
  return issue(tx, ctx, userId, uuidv7()); // a new sign-in starts a new session family
}

/**
 * Google sign-in (ADR 0003). The identity is already verified (google.ts); this decides which
 * invited user it may become (invite-match.ts) and starts the session. No invite, no account.
 */
export async function signInWithGoogle(
  db: Db,
  ctx: Context,
  identity: GoogleIdentity,
): Promise<IssuedSession> {
  return db.transaction(async (tx) => {
    const decision = matchInvite(
      identity,
      await repo.findUserBySub(tx, identity.sub),
      await repo.findUserByEmail(tx, identity.email),
    );
    if (!decision.allow) {
      throw new AppError('forbidden', decision.code, REFUSAL_MESSAGES[decision.code]);
    }
    if (decision.linkSub) await repo.linkGoogleSub(tx, decision.userId, identity.sub);
    return startSession(tx, ctx, decision.userId, decision.activate);
  });
}

/**
 * TEST IDENTITY PROVIDER ONLY: signs in an invited user by email alone, with no proof of
 * identity. Reachable only through test-idp.ts, which production can never register.
 */
export async function signInWithVerifiedEmail(
  db: Db,
  ctx: Context,
  email: string,
): Promise<IssuedSession> {
  return db.transaction(async (tx) => {
    const user = await repo.findUserByEmail(tx, email.toLowerCase());
    if (!user) throw new AppError('forbidden', 'NOT_INVITED', REFUSAL_MESSAGES.NOT_INVITED);
    if (user.status === 'disabled') {
      throw new AppError('forbidden', 'ACCOUNT_DISABLED', REFUSAL_MESSAGES.ACCOUNT_DISABLED);
    }
    return startSession(tx, ctx, user.id, user.status === 'invited');
  });
}

/**
 * Exchanges a refresh token for a new access + refresh token pair (rotation).
 * If a token that was ALREADY rotated is presented, someone kept a copy: the whole family is
 * revoked, so both the thief and the real user must sign in again.
 */
export async function refreshSession(
  db: Db,
  ctx: Context,
  refreshToken: string | undefined,
): Promise<IssuedSession> {
  if (!refreshToken) throw new AppError('unauthenticated', 'NO_SESSION', 'Not signed in.');
  // The reuse check has to COMMIT its revocation even though we then reject the request, so the
  // transaction returns a verdict and the error is thrown after it commits.
  const result = await db.transaction(async (tx) => {
    const session = await repo.findSessionByHashForUpdate(tx, hashToken(refreshToken));
    if (!session) return { ok: false as const, code: 'SESSION_INVALID' };
    if (session.revokedAt) {
      await repo.revokeFamily(tx, session.familyId);
      return { ok: false as const, code: 'SESSION_REUSED' };
    }
    if (session.expiresAt <= new Date()) return { ok: false as const, code: 'SESSION_EXPIRED' };
    await repo.revokeSession(tx, session.id);
    return { ok: true as const, issued: await issue(tx, ctx, session.userId, session.familyId) };
  });
  if (!result.ok) {
    throw new AppError('unauthenticated', result.code, 'Please sign in again.');
  }
  return result.issued;
}

/** Signing out revokes ALL of the user's sessions, on every device (spec §6). */
export async function signOut(db: Db, userId: string): Promise<void> {
  await repo.revokeAllForUser(db, userId);
}

export async function findActor(db: Db, userId: string, familyId: string): Promise<Actor | null> {
  const row = await repo.findActiveActor(db, userId, familyId);
  return row ? { ...row, familyId } : null;
}
