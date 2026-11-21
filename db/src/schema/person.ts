import { sql } from 'drizzle-orm';
import { check, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';
import { auditColumns, id } from './columns.ts';

export const personStatus = pgEnum('person_status', [
  'active',
  'inactive',
  'moved',
  'deceased',
  'archived',
]);

/**
 * A person known to the congregation: the centre of the data model (spec §5).
 * Minimal for M0 (ADR 0006). Spec §5's other columns arrive in M1 via expand-only migrations.
 * Only name and locality are required (data minimisation, spec §6).
 */
export const person = pgTable(
  'person',
  {
    id: id(),
    legalName: text().notNull(),
    displayName: text().notNull(),
    locality: text().notNull(),
    email: text(),
    // Explicit name: automatic snake_case would produce "phone_e_164".
    phoneE164: text('phone_e164'),
    status: personStatus().notNull().default('active'),
    ...auditColumns(),
  },
  (t) => [
    check('person_legal_name_not_blank', sql`btrim(${t.legalName}) <> ''`),
    check('person_display_name_not_blank', sql`btrim(${t.displayName}) <> ''`),
    // E.164: "+" then 7–15 digits, no leading zero. Normalising "98765 43210" is the app's job.
    check('person_phone_e164_format', sql`${t.phoneE164} ~ '^\\+[1-9][0-9]{6,14}$'`),
    check('person_email_lowercase', sql`${t.email} = lower(${t.email})`),
  ],
);
