import type { Db } from '@iwapp/db';
import { AppError } from '../../errors.ts';
import { recordAudit } from '../audit/index.ts';
import type { Actor } from '../auth/index.ts';
import { assertAllowed } from '../policy/index.ts';
import * as repo from './repo.ts';
import type { InviteUserBody, User } from './schemas.ts';

interface Ctx {
  actor: Actor;
  requestId: string;
}

function toUser(row: Awaited<ReturnType<typeof repo.insertInvite>>): User {
  return {
    id: row.id,
    personId: row.personId,
    email: row.email,
    isAdmin: row.isAdmin,
    status: row.status,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  };
}

/** Postgres unique_violation, and which constraint fired. */
function uniqueViolation(error: unknown): string | undefined {
  const cause = (error as { cause?: { code?: string; constraint?: string } }).cause;
  return cause?.code === '23505' ? cause.constraint : undefined;
}

/**
 * An admin invites someone to sign in (ADR 0003). Creates an `invited` app_user linked to an
 * existing person; their first Google sign-in with this email activates it.
 */
export async function inviteUser(db: Db, ctx: Ctx, body: InviteUserBody): Promise<User> {
  assertAllowed(ctx.actor, 'user.invite');
  return db.transaction(async (tx) => {
    if (!(await repo.personExists(tx, body.personId))) {
      throw new AppError('not_found', 'PERSON_NOT_FOUND', 'No such person.');
    }
    let row;
    try {
      row = await repo.insertInvite(tx, { ...body, createdBy: ctx.actor.userId });
    } catch (error) {
      // Let the database's unique indexes be the source of truth (no check-then-insert race).
      const constraint = uniqueViolation(error);
      if (constraint === 'app_user_email_key') {
        throw new AppError('conflict', 'EMAIL_TAKEN', 'Someone already has this email.');
      }
      if (constraint === 'app_user_person_id_key') {
        throw new AppError('conflict', 'PERSON_HAS_ACCOUNT', 'This person already has a login.');
      }
      throw error;
    }
    await recordAudit(tx, {
      actorId: ctx.actor.userId,
      action: 'user.invite',
      entity: 'app_user',
      entityId: row.id,
      changes: { email: { old: null, new: row.email }, isAdmin: { old: null, new: row.isAdmin } },
      requestId: ctx.requestId,
    });
    return toUser(row);
  });
}

export async function listUsers(db: Db, ctx: Ctx): Promise<User[]> {
  assertAllowed(ctx.actor, 'user.list');
  return (await repo.listUsers(db)).map(toUser);
}
