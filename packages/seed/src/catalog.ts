/** Fixed lists the generator draws from (spec §10). */

/** Bhakti Vrikshas are named after holy places: 27 = 3 sectors × 3 circles × 3 BVs. */
export const HOLY_PLACES = [
  'Dwarka',
  'Puri',
  'Govardhan',
  'Vrindavan',
  'Mayapur',
  'Ayodhya',
  'Kurukshetra',
  'Haridwar',
  'Rishikesh',
  'Udupi',
  'Pandharpur',
  'Tirupati',
  'Srirangam',
  'Guruvayur',
  'Nathdwara',
  'Badrinath',
  'Kedarnath',
  'Somnath',
  'Prayagraj',
  'Varanasi',
  'Ujjain',
  'Nashik',
  'Gokul',
  'Barsana',
  'Nandagram',
  'Radhakund',
  'Navadvipa',
] as const;

export const LOCALITIES = [
  'Whitefield',
  'Brookefield',
  'Hoodi',
  'Marathahalli',
  'Varthur',
  'KR Puram',
  'Kadugodi',
] as const;

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** How many people each size creates. The hierarchy is the same 3/9/27 for every size. */
export const SIZES = { small: 300, medium: 2_000, large: 10_000 } as const;
export type SeedSize = keyof typeof SIZES;

/**
 * Accounts that end-to-end and manual tests sign in as (through the test identity provider).
 * The .test domain is reserved (RFC 2606): it can never be someone's real address.
 */
export const TEST_USERS = {
  admin: { email: 'admin@iwapp.test', name: 'Test Admin' },
  circleLeader: { email: 'circle-leader@iwapp.test', name: 'Test Circle Leader' },
  bvLeader: { email: 'leader@iwapp.test', name: 'Test BV Leader' },
  member: { email: 'member@iwapp.test', name: 'Test Member' },
} as const;
