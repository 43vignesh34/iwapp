import { describe, expect, it } from 'vitest';
import { authorize, capabilitiesFor, type PersonResource, type PolicyActor } from './policy.ts';

const DWARKA = 'unit-dwarka';
const UDUPI = 'unit-udupi';

const member: PolicyActor = { personId: 'p-member', isAdmin: false, scopeUnitIds: new Set() };
const dwarkaLeader: PolicyActor = {
  personId: 'p-leader',
  isAdmin: false,
  scopeUnitIds: new Set([DWARKA]),
};
const admin: PolicyActor = { personId: 'p-admin', isAdmin: true, scopeUnitIds: new Set() };

const memberProfile: PersonResource = { type: 'person', id: 'p-member', unitIds: [DWARKA] };
const udupiPerson: PersonResource = { type: 'person', id: 'p-x', unitIds: [UDUPI] };

describe('authorize', () => {
  it('lets anyone read their own profile', () => {
    expect(authorize(member, 'member.read', memberProfile)).toBe(true);
  });

  it('lets a leader read members inside their scope, and only those', () => {
    expect(authorize(dwarkaLeader, 'member.read', memberProfile)).toBe(true);
    expect(authorize(dwarkaLeader, 'member.read', udupiPerson)).toBe(false);
  });

  it('does not let a member read someone else', () => {
    expect(authorize(member, 'member.read', udupiPerson)).toBe(false);
  });

  it('lets members edit their own contact details, not others', () => {
    expect(authorize(member, 'member.update.contact', memberProfile)).toBe(true);
    expect(authorize(member, 'member.update.contact', udupiPerson)).toBe(false);
  });

  it('keeps leaders from editing contact details until Q2 is answered', () => {
    expect(authorize(dwarkaLeader, 'member.update.contact', memberProfile)).toBe(false);
  });

  it('denies by default: user management is admin-only', () => {
    expect(authorize(member, 'user.invite')).toBe(false);
    expect(authorize(dwarkaLeader, 'user.invite')).toBe(false);
    expect(authorize(admin, 'user.invite')).toBe(true);
  });

  it('lets only leaders and admins list members', () => {
    expect(authorize(member, 'member.list')).toBe(false);
    expect(authorize(dwarkaLeader, 'member.list')).toBe(true);
    expect(authorize(admin, 'member.list')).toBe(true);
  });
});

describe('capabilitiesFor', () => {
  it('gives each role the menus its permissions allow', () => {
    expect(capabilitiesFor(member)).toEqual(['profile.view']);
    expect(capabilitiesFor(dwarkaLeader)).toEqual(['profile.view', 'members.view']);
    expect(capabilitiesFor(admin)).toEqual([
      'profile.view',
      'members.view',
      'members.create',
      'users.manage',
      'audit.view',
    ]);
  });
});
