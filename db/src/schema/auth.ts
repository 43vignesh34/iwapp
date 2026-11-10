import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { auditColumns, id } from './columns.ts';
import { person } from './person.ts';

export const appUserStatus = pgEnum('app_user_status', ['invited', 'active', 'disabled']);

/**
 * Someone who can sign in. Invite-only (ADR 0003): an admin creates the row with an email; the
 * first Google sign-in with that verified email stores google_sub and activates it.
 * Each user is exactly one person; many people never sign in (spec A4).
 */
export const appUser = pgTable(
  'app_user',
  {
    id: id(),
    personId: uuid()
      .notNull()
      .references(() => person.id),
    email: text().notNull(),
    googleSub: text(), // Google's stable account ID; emails can change, sub doesn't
    isAdmin: boolean().notNull().default(false),
    status: appUserStatus().notNull().default('invited'),
    lastLoginAt: timestamp({ withTimezone: true }),
    ...auditColumns(),
  },
  (t) => [
    uniqueIndex('app_user_person_id_key').on(t.personId),
    uniqueIndex('app_user_email_key').on(t.email),
    uniqueIndex('app_user_google_sub_key').on(t.googleSub),
    check('app_user_email_lowercase', sql`${t.email} = lower(${t.email})`),
  ],
);

/**
 * One row per refresh token. Tokens rotate: each refresh revokes its row and inserts a new one in
 * the same family. Presenting an already-revoked token means it was stolen and replayed, so the
 * whole family is revoked. Only a SHA-256 hash is stored, so a database leak yields no live tokens.
 *
 * A technical table: no version/updated_by columns (ADR 0009).
 */
export const userSession = pgTable(
  'user_session',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    familyId: uuid().notNull(),
    refreshHash: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('user_session_refresh_hash_key').on(t.refreshHash),
    index('user_session_user_id_idx').on(t.userId),
    index('user_session_family_id_idx').on(t.familyId),
  ],
);
