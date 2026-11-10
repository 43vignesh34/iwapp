import { membership, orgUnit, person, type DbOrTx } from '@iwapp/db';
import { and, asc, eq, gt, ilike, inArray, isNull, or, sql } from 'drizzle-orm';

export interface ListFilter {
  /** null = no scope filter (admins). Otherwise only people in one of these units. */
  scopeUnitIds: readonly string[] | null;
  q?: string;
  limit: number;
  after?: { legalName: string; id: string };
}

/** Escapes LIKE wildcards in user input, so "50%" searches for "50%", not "50 then anything". */
function likeContains(input: string): string {
  return `%${input.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * One page of members, ordered by (legal_name, id), using KEYSET pagination: "rows after the
 * last one you saw", not OFFSET. Pages stay fast on page 200, and don't skip or repeat rows
 * when someone is added meanwhile. The scope filter runs in SQL, so a leader's request never
 * even loads people outside their units.
 */
export async function listMembers(db: DbOrTx, filter: ListFilter) {
  const activeBv = db
    .select({ personId: membership.personId, name: orgUnit.name })
    .from(membership)
    .innerJoin(orgUnit, eq(orgUnit.id, membership.unitId))
    .where(
      and(
        isNull(membership.endDate),
        eq(membership.role, 'member'),
        eq(membership.unitKind, 'bhakti_vriksha'),
      ),
    )
    .as('active_bv');

  const conditions = [
    filter.scopeUnitIds === null
      ? undefined
      : filter.scopeUnitIds.length === 0
        ? sql`false`
        : sql`exists (
            select 1 from ${membership} m
            where m.person_id = ${person.id}
              and m.end_date is null
              and ${inArray(sql`m.unit_id`, [...filter.scopeUnitIds])}
          )`,
    filter.q
      ? or(
          ilike(person.legalName, likeContains(filter.q)),
          ilike(person.displayName, likeContains(filter.q)),
        )
      : undefined,
    filter.after
      ? or(
          gt(person.legalName, filter.after.legalName),
          and(eq(person.legalName, filter.after.legalName), gt(person.id, filter.after.id)),
        )
      : undefined,
  ];

  return db
    .select({
      id: person.id,
      displayName: person.displayName,
      legalName: person.legalName,
      locality: person.locality,
      status: person.status,
      bhaktiVriksha: activeBv.name,
    })
    .from(person)
    .leftJoin(activeBv, eq(activeBv.personId, person.id))
    .where(and(...conditions))
    .orderBy(asc(person.legalName), asc(person.id))
    .limit(filter.limit + 1); // one extra row tells us whether there's a next page
}

export async function findPerson(db: DbOrTx, id: string) {
  const [row] = await db.select().from(person).where(eq(person.id, id)).limit(1);
  return row;
}

type UnitRole = 'member' | 'leader' | 'co_leader';
/** The membership_role enum also has group roles (owner, facilitator). Unit memberships can't
 *  hold them: CHECK membership_unit_role. TypeScript can't see CHECK constraints, so we narrow
 *  here explicitly instead of casting. */
const isUnitRole = (role: string): role is UnitRole =>
  role === 'member' || role === 'leader' || role === 'co_leader';

export async function unitsOf(db: DbOrTx, personId: string) {
  const rows = await db
    .select({ id: orgUnit.id, name: orgUnit.name, kind: orgUnit.kind, role: membership.role })
    .from(membership)
    .innerJoin(orgUnit, eq(orgUnit.id, membership.unitId))
    .where(and(eq(membership.personId, personId), isNull(membership.endDate)))
    .orderBy(asc(orgUnit.kind), asc(orgUnit.name));
  return rows.flatMap((r) => (isUnitRole(r.role) ? [{ ...r, role: r.role }] : []));
}

export type PersonChanges = Partial<
  Pick<typeof person.$inferInsert, 'displayName' | 'locality' | 'email' | 'phoneE164'>
>;

/**
 * Optimistic locking: update only if the row is still at the version the client read. The check
 * and the write are ONE statement, so no other write can slip in between. Returns undefined if
 * the version didn't match (someone else saved first) or the person doesn't exist.
 */
export async function updatePersonIfVersion(
  db: DbOrTx,
  id: string,
  expectedVersion: number,
  changes: PersonChanges,
  updatedBy: string,
) {
  const [row] = await db
    .update(person)
    .set({ ...changes, updatedBy, updatedAt: sql`now()`, version: sql`${person.version} + 1` })
    .where(and(eq(person.id, id), eq(person.version, expectedVersion)))
    .returning();
  return row;
}
