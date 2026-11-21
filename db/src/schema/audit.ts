import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { id } from './columns.ts';

/** What changed in one audited write: field names, with old and new values. */
export type AuditChanges = Record<string, { old: unknown; new: unknown }>;

/**
 * Who changed what, when, in which request (spec §5, §6). Written in the SAME transaction as the
 * change it describes, so the two can never disagree. Append-only: a trigger in migration 0001
 * rejects UPDATE and DELETE. Readable by admins only.
 *
 * entity_id has no foreign key on purpose: the audit record must outlive an erased person.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    actorId: uuid(), // app_user.id; null = system/seed
    action: text().notNull(), // e.g. 'member.update'
    entity: text().notNull(), // e.g. 'person'
    entityId: uuid().notNull(),
    changes: jsonb().$type<AuditChanges>(),
    requestId: text(),
  },
  (t) => [
    index('audit_log_entity_idx').on(t.entity, t.entityId),
    index('audit_log_at_idx').on(t.at),
  ],
);
