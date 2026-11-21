/**
 * Which app_user (if any) a verified Google identity may sign in as. Pure: easy to test, and the
 * rules read like the policy they implement (ADR 0003: invite-only).
 */
export interface UserRow {
  id: string;
  email: string;
  googleSub: string | null;
  status: 'invited' | 'active' | 'disabled';
}

export type InviteDecision =
  | { allow: true; userId: string; linkSub: boolean; activate: boolean }
  | { allow: false; code: 'NOT_INVITED' | 'ACCOUNT_DISABLED' | 'ACCOUNT_MISMATCH' };

export function matchInvite(
  identity: { sub: string; email: string },
  bySub: UserRow | undefined,
  byEmail: UserRow | undefined,
): InviteDecision {
  // 1. This Google account has signed in before: trust the stable `sub`, even if the email changed.
  if (bySub) {
    if (bySub.status === 'disabled') return { allow: false, code: 'ACCOUNT_DISABLED' };
    return { allow: true, userId: bySub.id, linkSub: false, activate: bySub.status === 'invited' };
  }
  // 2. No invite for this email: no account. Nothing is created automatically.
  if (!byEmail) return { allow: false, code: 'NOT_INVITED' };
  if (byEmail.status === 'disabled') return { allow: false, code: 'ACCOUNT_DISABLED' };
  // 3. The invite is already linked to a DIFFERENT Google account. The email was probably
  //    recycled or re-registered. Refuse, rather than hand the profile to a stranger.
  if (byEmail.googleSub && byEmail.googleSub !== identity.sub) {
    return { allow: false, code: 'ACCOUNT_MISMATCH' };
  }
  // 4. First sign-in with an invited email: link the Google account and activate.
  return {
    allow: true,
    userId: byEmail.id,
    linkSub: byEmail.googleSub === null,
    activate: byEmail.status === 'invited',
  };
}
