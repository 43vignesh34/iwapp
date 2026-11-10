import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { auditColumns, id } from './columns.ts';
import { person } from './person.ts';

export const orgUnitKind = pgEnum('org_unit_kind', ['sector', 'circle', 'bhakti_vriksha']);
export const weekday = pgEnum('weekday', ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

/**
 * The Sector → Circle → Bhakti Vriksha tree (spec §5). One table, pointing at itself.
 *
 * "A circle's parent must be a sector; a BV's parent must be a circle" is enforced by the
 * database, not just the app. A CHECK constraint can only see its own row, so each row also
 * stores its parent's kind, and a composite foreign key (parent_id, parent_kind) → (id, kind)
 * makes Postgres confirm that the parent really is of that kind.
 */
export const orgUnit = pgTable(
  'org_unit',
  {
    id: id(),
    kind: orgUnitKind().notNull(),
    parentId: uuid(),
    parentKind: orgUnitKind(),
    name: text().notNull(),
    locality: text(),
    meetingDay: weekday(),
    active: boolean().notNull().default(true),
    ...auditColumns(),
  },
  (t) => [
    // The target of the composite foreign keys below (here and in membership).
    unique('org_unit_id_kind_key').on(t.id, t.kind),
    foreignKey({
      name: 'org_unit_parent_fk',
      columns: [t.parentId, t.parentKind],
      foreignColumns: [t.id, t.kind],
    }),
    check(
      'org_unit_parent_kind_rule',
      sql`(${t.kind} = 'sector' AND ${t.parentId} IS NULL AND ${t.parentKind} IS NULL)
       OR (${t.kind} = 'circle' AND ${t.parentId} IS NOT NULL AND ${t.parentKind} = 'sector')
       OR (${t.kind} = 'bhakti_vriksha' AND ${t.parentId} IS NOT NULL AND ${t.parentKind} = 'circle')`,
    ),
    check('org_unit_name_not_blank', sql`btrim(${t.name}) <> ''`),
    // No two siblings share a name. NULLS NOT DISTINCT makes this hold for sectors (parent NULL).
    unique('org_unit_sibling_name_key').on(t.parentId, t.name).nullsNotDistinct(),
    index('org_unit_parent_id_idx').on(t.parentId),
  ],
);

export const membershipRole = pgEnum('membership_role', [
  'member',
  'leader',
  'co_leader',
  'owner',
  'facilitator',
]);

/**
 * A person's membership of a hierarchy unit, with history: leaving sets end_date; rows are never
 * deleted (spec §5). M0 covers units only; group_id arrives with groups in M2 (ADR 0006).
 *
 * unit_kind is copied from the unit (and kept honest by a composite foreign key), so a partial
 * unique index can enforce "one active Bhakti Vriksha per person" (Q3) without a trigger.
 */
export const membership = pgTable(
  'membership',
  {
    id: id(),
    personId: uuid()
      .notNull()
      .references(() => person.id),
    unitId: uuid().notNull(),
    unitKind: orgUnitKind().notNull(),
    role: membershipRole().notNull(),
    startDate: date().notNull().defaultNow(),
    endDate: date(),
    endReason: text(),
    ...auditColumns(),
  },
  (t) => [
    foreignKey({
      name: 'membership_unit_fk',
      columns: [t.unitId, t.unitKind],
      foreignColumns: [orgUnit.id, orgUnit.kind],
    }),
    // owner/facilitator are group roles; they become valid when group_id arrives (M2).
    check('membership_unit_role', sql`${t.role} IN ('member', 'leader', 'co_leader')`),
    check('membership_dates', sql`${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`),
    check('membership_end_reason', sql`${t.endReason} IS NULL OR ${t.endDate} IS NOT NULL`),
    // Q3: at most one active BV membership per person.
    uniqueIndex('membership_one_active_bv')
      .on(t.personId)
      .where(
        sql`${t.endDate} IS NULL AND ${t.role} = 'member' AND ${t.unitKind} = 'bhakti_vriksha'`,
      ),
    // At most one active leader per unit (co-leaders are unlimited).
    uniqueIndex('membership_one_active_leader')
      .on(t.unitId)
      .where(sql`${t.endDate} IS NULL AND ${t.role} = 'leader'`),
    // No duplicate active rows for the same person, unit and role.
    uniqueIndex('membership_active_unique')
      .on(t.personId, t.unitId, t.role)
      .where(sql`${t.endDate} IS NULL`),
    index('membership_unit_id_idx').on(t.unitId),
  ],
);
