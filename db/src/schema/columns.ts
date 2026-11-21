import { integer, timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/**
 * UUIDv7 primary key, generated in the app. v7 IDs start with a timestamp, so new rows land at
 * the end of the B-tree index (fast inserts) and IDs sort by creation time. Postgres 18 adds a
 * native uuidv7(); on 17 we generate it in Node.
 */
export const id = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7());

/**
 * Columns every business table carries (CLAUDE.md → Database).
 * - created_by / updated_by: the app_user who made the change (null = system or seed).
 *   No foreign key: an audit trail must survive the user being anonymised or deleted.
 * - version: optimistic locking. Writes say "UPDATE … WHERE version = <what I read>", and send
 *   it to clients as the ETag, so two leaders can't silently overwrite each other.
 */
export const auditColumns = () => ({
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid(),
  version: integer().notNull().default(1),
});
