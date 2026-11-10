import type { Db } from '@iwapp/db';
import type { MemberDetail, MemberListResponse, UpdateMemberBody } from '@iwapp/shared';
import { AppError } from '../../errors.ts';
import { diffFields, recordAudit } from '../audit/index.ts';
import type { Actor } from '../auth/index.ts';
import { activeUnitIdsOf } from '../hierarchy/index.ts';
import { assertAllowed, type PersonResource } from '../policy/index.ts';
import { decodeCursor, encodeCursor } from './cursor.ts';
import { normalizePhone } from './domain/phone.ts';
import * as repo from './repo.ts';

export interface Ctx {
  actor: Actor;
  requestId: string;
}

/** Members in the actor's scope (everyone, for admins), one page at a time. */
export async function listMembers(
  db: Db,
  ctx: Ctx,
  query: { q?: string; limit: number; cursor?: string },
): Promise<MemberListResponse> {
  assertAllowed(ctx.actor, 'member.list');
  const rows = await repo.listMembers(db, {
    scopeUnitIds: ctx.actor.isAdmin ? null : [...ctx.actor.scopeUnitIds],
    q: query.q,
    limit: query.limit,
    after: query.cursor ? decodeCursor(query.cursor) : undefined,
  });
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page,
    nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
  };
}

async function loadPersonResource(db: Db, id: string) {
  const row = await repo.findPerson(db, id);
  if (!row) throw new AppError('not_found', 'MEMBER_NOT_FOUND', 'No such member.');
  const resource: PersonResource = { type: 'person', id, unitIds: await activeUnitIdsOf(db, id) };
  return { row, resource };
}

async function toDetail(db: Db, row: NonNullable<Awaited<ReturnType<typeof repo.findPerson>>>) {
  const detail: MemberDetail = {
    id: row.id,
    legalName: row.legalName,
    displayName: row.displayName,
    locality: row.locality,
    email: row.email ?? null,
    phoneE164: row.phoneE164 ?? null,
    status: row.status,
    units: await repo.unitsOf(db, row.id),
    version: row.version,
  };
  return detail;
}

/** One member's profile. Allowed for the member themselves, leaders in scope, and admins. */
export async function getMember(db: Db, ctx: Ctx, id: string): Promise<MemberDetail> {
  const { row, resource } = await loadPersonResource(db, id);
  // Out of scope → 403, not 404. IDs are UUIDv7 (not guessable), and a clear 403 helps leaders
  // and support. Recorded in ADR 0012; revisit if enumeration ever becomes a concern.
  assertAllowed(ctx.actor, 'member.read', resource);
  return toDetail(db, row);
}

/**
 * Corrects a member's contact and personal fields (journey 5). In ONE transaction:
 * load → authorise → normalise → update-if-version → audit → commit.
 */
export async function updateMember(
  db: Db,
  ctx: Ctx,
  id: string,
  expectedVersion: number,
  body: UpdateMemberBody,
): Promise<MemberDetail> {
  const { row: before, resource } = await loadPersonResource(db, id);
  assertAllowed(ctx.actor, 'member.update', resource);

  const changes: repo.PersonChanges = {};
  if (body.displayName !== undefined) changes.displayName = body.displayName;
  if (body.locality !== undefined) changes.locality = body.locality;
  if (body.email !== undefined) changes.email = body.email;
  if (body.phone !== undefined) {
    const phone = body.phone === null ? null : normalizePhone(body.phone);
    if (body.phone !== null && phone === null) {
      throw new AppError('invalid', 'INVALID_PHONE', 'That does not look like a phone number.');
    }
    changes.phoneE164 = phone;
  }

  const diff = diffFields(before, changes);
  if (Object.keys(diff).length === 0) {
    if (before.version !== expectedVersion) {
      throw new AppError(
        'precondition_failed',
        'VERSION_MISMATCH',
        'Someone else changed this member. Reload and try again.',
      );
    }
    return toDetail(db, before); // nothing changed: no write, no audit row, same version
  }

  const after = await db.transaction(async (tx) => {
    const updated = await repo.updatePersonIfVersion(
      tx,
      id,
      expectedVersion,
      changes,
      ctx.actor.userId,
    );
    if (!updated) {
      throw new AppError(
        'precondition_failed',
        'VERSION_MISMATCH',
        'Someone else changed this member. Reload and try again.',
      );
    }
    await recordAudit(tx, {
      actorId: ctx.actor.userId,
      action: 'member.update',
      entity: 'person',
      entityId: id,
      changes: diff,
      requestId: ctx.requestId,
    });
    return updated;
  });
  return toDetail(db, after);
}
