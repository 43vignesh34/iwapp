import type { Capability } from '@iwapp/shared';

export interface NavItem {
  label: string;
  to: '/profile' | '/members' | '/admin/users';
  /** Shown only if /me lists this capability. The API still checks every request itself. */
  capability: Capability;
}

const ALL_ITEMS: NavItem[] = [
  { label: 'My profile', to: '/profile', capability: 'profile.view' },
  { label: 'Members', to: '/members', capability: 'members.view' },
  { label: 'Users', to: '/admin/users', capability: 'users.manage' },
];

/** The menu for this user: built from their capabilities, never from their role name (spec §7). */
export function navItemsFor(capabilities: readonly Capability[]): NavItem[] {
  return ALL_ITEMS.filter((item) => capabilities.includes(item.capability));
}
