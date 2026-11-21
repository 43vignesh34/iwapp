import { appUser, person, userSession, type DbOrTx } from '@iwapp/db';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';

/** SQL only: no decisions here. The service decides what each result means. */

export async function findUserByEmail(db: DbOrTx, email: string) {
  const [row] = await db.select().from(appUser).where(eq(appUser.email, email)).limit(1);
  return row;
}

export async function findUserBySub(db: DbOrTx, googleSub: string) {
  const [row] = await db.select().from(appUser).where(eq(appUser.googleSub, googleSub)).limit(1);
  return row;
}

export async function linkGoogleSub(db: DbOrTx, userId: string, googleSub: string) {
  await db
    .update(appUser)
    .set({
      googleSub,
      updatedAt: sql`now()`,
      updatedBy: userId,
      version: sql`${appUser.version} + 1`,
    })
    .where(eq(appUser.id, userId));
}

export async function markSignedIn(db: DbOrTx, userId: string, activate: boolean) {
  await db
    .update(appUser)
    .set({
      lastLoginAt: sql`now()`,
      ...(activate
        ? {
            status: 'active' as const,
            updatedAt: sql`now()`,
            updatedBy: userId,
            version: sql`${appUser.version} + 1`,
          }
        : {}),
    })
    .where(eq(appUser.id, userId));
}

export async function insertSession(
  db: DbOrTx,
  values: { userId: string; familyId: string; refreshHash: string; expiresAt: Date },
) {
  await db.insert(userSession).values(values);
}

/** Locks the row (FOR UPDATE) so two concurrent refreshes of the same token can't both succeed. */
export async function findSessionByHashForUpdate(db: DbOrTx, refreshHash: string) {
  const [row] = await db
    .select()
    .from(userSession)
    .where(eq(userSession.refreshHash, refreshHash))
    .limit(1)
    .for('update');
  return row;
}

export async function revokeSession(db: DbOrTx, sessionId: string) {
  await db
    .update(userSession)
    .set({ revokedAt: sql`now()` })
    .where(eq(userSession.id, sessionId));
}

export async function revokeFamily(db: DbOrTx, familyId: string) {
  await db
    .update(userSession)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(userSession.familyId, familyId), isNull(userSession.revokedAt)));
}

export async function revokeAllForUser(db: DbOrTx, userId: string) {
  await db
    .update(userSession)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(userSession.userId, userId), isNull(userSession.revokedAt)));
}

/**
 * The signed-in user behind an access token, in ONE query, or nothing if the user is no longer
 * active or the session family has been revoked (logout, disable). Runs on every authenticated
 * request, so logout and disabling take effect at once rather than when the JWT expires.
 */
export async function findActiveActor(db: DbOrTx, userId: string, familyId: string) {
  const [row] = await db
    .select({
      userId: appUser.id,
      personId: appUser.personId,
      email: appUser.email,
      isAdmin: appUser.isAdmin,
      displayName: person.displayName,
    })
    .from(appUser)
    .innerJoin(person, eq(person.id, appUser.personId))
    .where(
      and(
        eq(appUser.id, userId),
        eq(appUser.status, 'active'),
        sql`exists (
          select 1 from ${userSession}
          where ${userSession.familyId} = ${familyId}
            and ${userSession.userId} = ${userId}
            and ${isNull(userSession.revokedAt)}
            and ${gt(userSession.expiresAt, sql`now()`)}
        )`,
      ),
    )
    .limit(1);
  return row;
}
