import { appUser, auditLog, person } from '@iwapp/db';
import { TEST_USERS } from '@iwapp/seed';
import { and, eq, notInArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seededApp } from '../../../test/app.ts';
import { signIn, withSession, type CookieJar } from '../../../test/session.ts';

let ctx: Awaited<ReturnType<typeof seededApp>>;
let admin: CookieJar;
beforeAll(async () => {
  ctx = await seededApp();
  admin = await signIn(ctx.app, TEST_USERS.admin.email);
});
afterAll(async () => {
  await ctx.close();
});

async function personWithoutLogin() {
  const withLogin = ctx.database.db.select({ id: appUser.personId }).from(appUser);
  const [row] = await ctx.database.db
    .select()
    .from(person)
    .where(notInArray(person.id, withLogin))
    .limit(1);
  if (!row) throw new Error('fixture missing');
  return row;
}
const invite = (jar: CookieJar, payload: unknown) =>
  ctx.app.inject({
    method: 'POST',
    url: '/api/v1/users',
    payload: payload as object,
    ...withSession(jar),
  });

describe('POST /api/v1/users (invite)', () => {
  it('creates an invited login for an existing person, and audit-logs it', async () => {
    const p = await personWithoutLogin();
    const res = await invite(admin, { email: 'New.Volunteer@Example.com', personId: p.id });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      email: 'new.volunteer@example.com',
      status: 'invited',
      isAdmin: false,
    });
    const audits = await ctx.database.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'user.invite'),
          eq(auditLog.entityId, res.json<{ id: string }>().id),
        ),
      );
    expect(audits).toHaveLength(1);
  });

  it('refuses a second login for the same email or the same person (409)', async () => {
    const p = await personWithoutLogin();
    expect(
      (await invite(admin, { email: TEST_USERS.member.email, personId: p.id })).json(),
    ).toMatchObject({
      status: 409,
      code: 'EMAIL_TAKEN',
    });
    const [memberUser] = await ctx.database.db
      .select()
      .from(appUser)
      .where(eq(appUser.email, TEST_USERS.member.email));
    expect(
      (await invite(admin, { email: 'other@example.com', personId: memberUser?.personId })).json(),
    ).toMatchObject({ status: 409, code: 'PERSON_HAS_ACCOUNT' });
  });

  it('404s for a person that does not exist', async () => {
    const res = await invite(admin, {
      email: 'x@example.com',
      personId: '00000000-0000-7000-8000-000000000000',
    });
    expect(res.json()).toMatchObject({ status: 404, code: 'PERSON_NOT_FOUND' });
  });

  it('an invited user can then sign in, which activates the login', async () => {
    const p = await personWithoutLogin();
    await invite(admin, { email: 'invitee@example.com', personId: p.id });
    const jar = await signIn(ctx.app, 'invitee@example.com');
    const me = await ctx.app.inject({ method: 'GET', url: '/api/v1/me', ...withSession(jar) });
    expect(me.json()).toMatchObject({ person: { id: p.id } });
  });
});
