import { describe, expect, it } from 'vitest';
import { navItemsFor } from './nav';

describe('navItemsFor', () => {
  it('a member sees only their profile', () => {
    expect(navItemsFor(['profile.view']).map((i) => i.label)).toEqual(['My profile']);
  });

  it('a leader also sees Members', () => {
    expect(navItemsFor(['profile.view', 'members.view']).map((i) => i.label)).toEqual([
      'My profile',
      'Members',
    ]);
  });

  it('an admin sees everything, in a fixed order', () => {
    expect(
      navItemsFor([
        'users.manage',
        'audit.view',
        'members.create',
        'members.view',
        'profile.view',
      ]).map((i) => i.label),
    ).toEqual(['My profile', 'Members', 'Users']);
  });
});
