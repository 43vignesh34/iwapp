import { appUser, person, type DbOrTx } from '@iwapp/db';
import { asc, eq } from 'drizzle-orm';

export async function personExists(db: DbOrTx, personId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.id, personId))
    .limit(1);
  return row !== undefined;
}

export async function insertInvite(
  db: DbOrTx,
  values: { email: string; personId: string; isAdmin: boolean; createdBy: string },
) {
  const [row] = await db
    .insert(appUser)
    .values({ ...values, status: 'invited', updatedBy: values.createdBy })
    .returning();
  if (!row) throw new Error('insert returned no row');
  return row;
}

export async function listUsers(db: DbOrTx) {
  return db.select().from(appUser).orderBy(asc(appUser.email)).limit(500);
}
