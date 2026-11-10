import { auditLog, person } from '@iwapp/db';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDatabase } from './database.ts';

let database: Awaited<ReturnType<typeof freshDatabase>>;
beforeAll(async () => {
  database = await freshDatabase();
});
afterAll(async () => {
  await database.close();
});

/** Postgres error code of a rejected query (drizzle wraps the driver error as `cause`). */
async function pgErrorCode(query: Promise<unknown>): Promise<string | undefined> {
  try {
    await query;
    return undefined;
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ?? (error as { code?: string }).code;
  }
}

describe('migrations', () => {
  it('create the M0 core tables', async () => {
    const rows = await database.db.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
    );
    expect(rows.rows.map((r) => r.tablename)).toEqual([
      'app_user',
      'audit_log',
      'person',
      'user_session',
    ]);
  });
});

describe('person', () => {
  it('gets a time-ordered UUIDv7 id and version 1 by default', async () => {
    const [a] = await database.db
      .insert(person)
      .values({ legalName: 'Asha Rao', displayName: 'Asha', locality: 'Hoodi' })
      .returning();
    const [b] = await database.db
      .insert(person)
      .values({ legalName: 'Bala K', displayName: 'Bala', locality: 'Varthur' })
      .returning();
    expect(a?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/); // the "7" is the UUID version
    expect(a?.version).toBe(1);
    expect(a && b && a.id < b.id).toBe(true); // later insert, larger id
  });

  it.each([
    ['a phone number that is not E.164', { phoneE164: '98765 43210' }],
    ['an email with capitals', { email: 'Asha@Example.com' }],
    ['a blank legal name', { legalName: '   ' }],
  ])('rejects %s (check constraint)', async (_label, override) => {
    const code = await pgErrorCode(
      database.db
        .insert(person)
        .values({ legalName: 'X', displayName: 'X', locality: 'Hoodi', ...override }),
    );
    expect(code).toBe('23514'); // check_violation
  });
});

describe('audit_log', () => {
  it('is append-only: UPDATE and DELETE are rejected by the trigger', async () => {
    const [row] = await database.db
      .insert(auditLog)
      .values({ action: 'test.create', entity: 'person', entityId: crypto.randomUUID() })
      .returning();
    if (!row) throw new Error('insert failed');

    expect(
      await pgErrorCode(
        database.db.update(auditLog).set({ action: 'tampered' }).where(eq(auditLog.id, row.id)),
      ),
    ).toBe('42501'); // insufficient_privilege, raised by audit_log_forbid_change()
    expect(await pgErrorCode(database.db.delete(auditLog).where(eq(auditLog.id, row.id)))).toBe(
      '42501',
    );
  });
});
