import type { Db } from '@iwapp/db';
import { uuidv7 } from 'uuidv7';
import { AppError } from '../../errors.ts';
import { recordAudit } from '../audit/index.ts';
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
  db: Db | Parameters<Parameters<Db['transaction']>[0]>[0],
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

/**
 * Signs in someone whose identity is already proven (by Google, or by the test identity
 * provider), using their verified email. Invite-only (ADR 0003): no row, no account.
 */
export async function signInWithVerifiedEmail(
  db: Db,
  ctx: Context,
  email: string,
): Promise<IssuedSession> {
  return db.transaction(async (tx) => {
    const user = await repo.findUserByEmail(tx, email.toLowerCase());
    if (!user) {
      throw new AppError('forbidden', 'NOT_INVITED', 'Ask an admin to invite you.');
    }
    if (user.status === 'disabled') {
      throw new AppError('forbidden', 'ACCOUNT_DISABLED', 'This account has been disabled.');
    }
    const activating = user.status === 'invited';
    await repo.markSignedIn(tx, user.id, activating);
    if (activating) {
      await recordAudit(tx, {
        actorId: user.id,
        action: 'user.activate',
        entity: 'app_user',
        entityId: user.id,
        changes: { status: { old: 'invited', new: 'active' } },
        requestId: ctx.requestId,
      });
    }
    return issue(tx, ctx, user.id, uuidv7()); // a new sign-in starts a new session family
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
