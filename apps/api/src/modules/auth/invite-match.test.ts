import { describe, expect, it } from 'vitest';
import { matchInvite, type UserRow } from './invite-match.ts';

const identity = { sub: 'google-123', email: 'radha@example.com' };
const row = (over: Partial<UserRow> = {}): UserRow => ({
  id: 'u1',
  email: 'radha@example.com',
  googleSub: null,
  status: 'invited',
  ...over,
});

describe('matchInvite', () => {
  it('first sign-in of an invited email: link the Google account and activate', () => {
    expect(matchInvite(identity, undefined, row())).toEqual({
      allow: true,
      userId: 'u1',
      linkSub: true,
      activate: true,
    });
  });

  it('returning user, found by sub: allow without changes', () => {
    const user = row({ googleSub: 'google-123', status: 'active' });
    expect(matchInvite(identity, user, user)).toEqual({
      allow: true,
      userId: 'u1',
      linkSub: false,
      activate: false,
    });
  });

  it('returning user whose Google email changed: still found by sub', () => {
    const user = row({ googleSub: 'google-123', status: 'active', email: 'old@example.com' });
    expect(matchInvite(identity, user, undefined)).toMatchObject({ allow: true, userId: 'u1' });
  });

  it('no invite: refuse', () => {
    expect(matchInvite(identity, undefined, undefined)).toEqual({
      allow: false,
      code: 'NOT_INVITED',
    });
  });

  it('disabled, found by sub or by email: refuse', () => {
    const user = row({ googleSub: 'google-123', status: 'disabled' });
    expect(matchInvite(identity, user, user)).toEqual({ allow: false, code: 'ACCOUNT_DISABLED' });
    expect(matchInvite(identity, undefined, row({ status: 'disabled' }))).toEqual({
      allow: false,
      code: 'ACCOUNT_DISABLED',
    });
  });

  it('email invite already linked to ANOTHER Google account: refuse', () => {
    expect(
      matchInvite(identity, undefined, row({ googleSub: 'google-999', status: 'active' })),
    ).toEqual({ allow: false, code: 'ACCOUNT_MISMATCH' });
  });

  it('an active user signing in with Google for the first time gets linked, not re-activated', () => {
    expect(matchInvite(identity, undefined, row({ status: 'active' }))).toEqual({
      allow: true,
      userId: 'u1',
      linkSub: true,
      activate: false,
    });
  });
});
