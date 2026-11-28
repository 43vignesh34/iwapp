import { Faker, en, en_IN } from '@faker-js/faker';
import type { appUser, leadershipPost, membership, orgUnit, person } from '@iwapp/db';
import { HOLY_PLACES, LOCALITIES, SIZES, TEST_USERS, WEEKDAYS, type SeedSize } from './catalog.ts';
import { deterministicUuidv7 } from './ids.ts';

export type SeedPerson = typeof person.$inferInsert & { id: string };
export type SeedOrgUnit = typeof orgUnit.$inferInsert & { id: string };
export type SeedMembership = typeof membership.$inferInsert;
export type SeedAppUser = typeof appUser.$inferInsert;
export type SeedLeadershipPost = typeof leadershipPost.$inferInsert;

export interface SeedData {
  orgUnits: SeedOrgUnit[];
  people: SeedPerson[];
  memberships: SeedMembership[];
  leadershipPosts: SeedLeadershipPost[];
  appUsers: SeedAppUser[];
}

export interface GenerateOptions {
  size: SeedSize;
  seed: number;
}

/**
 * Builds a whole synthetic congregation in memory. Pure: no database, no clock, no global state.
 * Same options → identical output, which is what makes test failures reproducible.
 */
export function generate({ size, seed }: GenerateOptions): SeedData {
  // A private Faker instance (not the shared global), seeded once. Every random choice below
  // comes from it, in a fixed order.
  const faker = new Faker({ locale: [en_IN, en] });
  faker.seed(seed);
  const newId = deterministicUuidv7(faker);
  const date = (from: string, to: string) =>
    faker.date.between({ from, to }).toISOString().slice(0, 10);

  // 1. Hierarchy (ADR 0013): 3 circles × 3 sectors × 4 BVs, matching the organisation chart.
  const orgUnits: SeedOrgUnit[] = [];
  const bvs: SeedOrgUnit[] = [];
  const circles: SeedOrgUnit[] = [];
  const sectors: SeedOrgUnit[] = [];
  let place = 0;
  for (let c = 1; c <= 3; c++) {
    const circle: SeedOrgUnit = { id: newId(), kind: 'circle', name: `Circle ${String(c)}` };
    circles.push(circle);
    orgUnits.push(circle);
    for (let s = 1; s <= 3; s++) {
      const sector: SeedOrgUnit = {
        id: newId(),
        kind: 'sector',
        parentId: circle.id,
        parentKind: 'circle',
        name: `Sector ${String(c)}.${String(s)}`,
      };
      sectors.push(sector);
      orgUnits.push(sector);
      for (let b = 1; b <= 4; b++) {
        const bv: SeedOrgUnit = {
          id: newId(),
          kind: 'bhakti_vriksha',
          parentId: sector.id,
          parentKind: 'sector',
          name: `${HOLY_PLACES[place++] ?? 'BV'} Bhakti Vriksha`,
          locality: faker.helpers.arrayElement(LOCALITIES),
          meetingDay: faker.helpers.arrayElement(WEEKDAYS),
        };
        bvs.push(bv);
        orgUnits.push(bv);
      }
    }
  }

  // 2. People. The four test users come first so their IDs are stable across sizes.
  const people: SeedPerson[] = [];
  const makePerson = (legalName: string, displayName: string, email?: string): SeedPerson => ({
    id: newId(),
    legalName,
    displayName,
    locality: faker.helpers.arrayElement(LOCALITIES),
    email,
    // ~85% have a phone: +91, then a 10-digit mobile number starting 6–9.
    phoneE164: faker.datatype.boolean(0.85)
      ? `+91${String(faker.number.int({ min: 6, max: 9 }))}${faker.string.numeric(9)}`
      : undefined,
    status: faker.helpers.weightedArrayElement([
      { weight: 92, value: 'active' as const },
      { weight: 5, value: 'inactive' as const },
      { weight: 3, value: 'moved' as const },
    ]),
  });

  const testPeople = Object.fromEntries(
    Object.entries(TEST_USERS).map(([key, u]) => {
      const p = {
        ...makePerson(u.name, u.name.split(' ').slice(-1)[0] ?? u.name, u.email),
        status: 'active' as const,
      };
      people.push(p);
      return [key, p];
    }),
  ) as Record<keyof typeof TEST_USERS, SeedPerson>;

  const total = SIZES[size];
  for (let i = people.length; i < total; i++) {
    const first = faker.person.firstName();
    const last = faker.person.lastName();
    // ~70% have an email, always @example.com (reserved, so never a real inbox).
    const email = faker.datatype.boolean(0.7)
      ? `${first}.${last}.${String(i)}@example.com`.toLowerCase().replace(/[^a-z0-9.@]/g, '')
      : undefined;
    people.push(makePerson(`${first} ${last}`, first, email));
  }

  // 3. BV memberships: ~85% of people belong to exactly one BV.
  const memberships: SeedMembership[] = [];
  const membersOf = new Map<string, SeedPerson[]>(bvs.map((bv) => [bv.id, []]));
  const join = (p: SeedPerson, unit: SeedOrgUnit, role: 'member' | 'leader' | 'co_leader') => {
    memberships.push({
      id: newId(),
      personId: p.id,
      unitId: unit.id,
      unitKind: unit.kind,
      role,
      startDate: date('2018-01-01', '2026-06-30'),
    });
  };

  const dwarka = bvs[0];
  const srirangam = bvs[12]; // first BV of Circle 2, so outside the test circle leader's scope
  const firstCircle = circles[0];
  if (!dwarka || !srirangam || !firstCircle) throw new Error('hierarchy generation failed');

  // Test users: member and BV leader in Dwarka (Sector 1.1, Circle 1); the circle leader leads
  // Circle 1, the top level, so their scope exercises the full recursion circle → sector → BV.
  join(testPeople.member, dwarka, 'member');
  join(testPeople.bvLeader, dwarka, 'member');
  join(testPeople.bvLeader, dwarka, 'leader');
  join(testPeople.circleLeader, firstCircle, 'leader');
  join(testPeople.otherLeader, srirangam, 'member');
  join(testPeople.otherLeader, srirangam, 'leader');
  membersOf.get(dwarka.id)?.push(testPeople.member, testPeople.bvLeader);
  membersOf.get(srirangam.id)?.push(testPeople.otherLeader);
  const ledByTestUser = new Set([dwarka.id, srirangam.id]);

  for (const p of people.slice(Object.keys(TEST_USERS).length)) {
    if (!faker.datatype.boolean(0.85)) continue;
    const bv = faker.helpers.arrayElement(bvs);
    join(p, bv, 'member');
    membersOf.get(bv.id)?.push(p);
  }

  // 4. Leaders: every unit gets one, drawn from the people under it. Half the BVs get a co-leader.
  const isTestPerson = (p: SeedPerson) => Object.values(testPeople).includes(p);
  for (const bv of bvs) {
    // Leaders come from generated people only; Dwarka already has the test BV leader.
    const candidates = (membersOf.get(bv.id) ?? []).filter(
      (p) => p.status === 'active' && !isTestPerson(p),
    );
    const [first, second] = candidates;
    if (!ledByTestUser.has(bv.id) && first) join(first, bv, 'leader');
    const coLeader = ledByTestUser.has(bv.id) ? first : second;
    if (coLeader && faker.datatype.boolean(0.5)) join(coLeader, bv, 'co_leader');
  }
  const activeUnder = (unit: SeedOrgUnit) =>
    bvs
      .filter(
        (bv) =>
          bv.parentId === unit.id ||
          sectors.find((s) => s.id === bv.parentId)?.parentId === unit.id,
      )
      .flatMap((bv) => membersOf.get(bv.id) ?? [])
      .filter((p) => p.status === 'active' && !isTestPerson(p));
  for (const sector of sectors) {
    const leader = faker.helpers.arrayElement(activeUnder(sector));
    join(leader, sector, 'leader');
  }
  for (const circle of circles) {
    if (circle.id === firstCircle.id) continue; // led by the test circle leader
    const leader = faker.helpers.arrayElement(activeUnder(circle));
    join(leader, circle, 'leader');
  }

  // 5. Leadership posts above the tree (ADR 0013): the test account is the Supervising Preacher,
  //    and a generated person is the Program Director.
  const programDirector = faker.helpers.arrayElement(
    people.filter((p) => p.status === 'active' && !isTestPerson(p)),
  );
  const leadershipPosts: SeedLeadershipPost[] = [
    {
      id: newId(),
      personId: programDirector.id,
      post: 'program_director',
      startDate: date('2015-01-01', '2020-12-31'),
    },
    {
      id: newId(),
      personId: testPeople.preacher.id,
      post: 'supervising_preacher',
      startDate: date('2018-01-01', '2024-12-31'),
    },
  ];

  // 6. App users: only the test accounts. Real users are invited by an admin (T7).
  const appUsers: SeedAppUser[] = Object.entries(TEST_USERS).map(([key, u]) => ({
    id: newId(),
    personId: testPeople[key as keyof typeof TEST_USERS].id,
    email: u.email,
    isAdmin: key === 'admin',
    status: 'active' as const,
  }));

  return { orgUnits, people, memberships, leadershipPosts, appUsers };
}
