import { auditLog, type AuditChanges, type DbOrTx } from '@iwapp/db';

export interface AuditEntry {
  /** app_user.id of whoever made the change; null for the system. */
  actorId: string | null;
  /** What happened, as module.verb, e.g. 'member.update', 'user.activate'. */
  action: string;
  entity: string;
  entityId: string;
  changes?: AuditChanges;
  requestId?: string;
}

/**
 * Records one audited change. Pass the SAME transaction (`tx`) as the write it describes, so
 * both commit or neither does: the audit log can then never claim a change that didn't happen,
 * or miss one that did.
 */
export async function recordAudit(tx: DbOrTx, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values(entry);
}

/** Old and new values of just the fields that changed. Fields that stayed the same are omitted. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): AuditChanges {
  const changes: AuditChanges = {};
  for (const key of Object.keys(after)) {
    const next = after[key];
    if (next !== undefined && next !== before[key]) {
      changes[key] = { old: before[key] ?? null, new: next };
    }
  }
  return changes;
}
