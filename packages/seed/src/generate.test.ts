import { describe, expect, it } from 'vitest';
import { TEST_USERS } from './catalog.ts';
import { generate } from './generate.ts';

const small = generate({ size: 'small', seed: 108 });

describe('generate', () => {
  it('is deterministic: the same seed gives identical data', () => {
    expect(generate({ size: 'small', seed: 108 })).toEqual(small);
  });

  it('gives different data for a different seed', () => {
    expect(generate({ size: 'small', seed: 109 }).people).not.toEqual(small.people);
  });

  it('builds 3 sectors, 9 circles and 27 BVs', () => {
    const count = (kind: string) => small.orgUnits.filter((u) => u.kind === kind).length;
    expect([count('sector'), count('circle'), count('bhakti_vriksha')]).toEqual([3, 9, 27]);
  });

  it('creates 300 people for size=small, including the test users', () => {
    expect(small.people).toHaveLength(300);
    const emails = small.people.map((p) => p.email);
    for (const u of Object.values(TEST_USERS)) expect(emails).toContain(u.email);
  });

  it('gives every unit exactly one leader', () => {
    for (const unit of small.orgUnits) {
      const leaders = small.memberships.filter((m) => m.unitId === unit.id && m.role === 'leader');
      expect(leaders, unit.name).toHaveLength(1);
    }
  });

  it('puts nobody in more than one BV as a member (Q3)', () => {
    const bvMembers = small.memberships
      .filter((m) => m.role === 'member' && m.unitKind === 'bhakti_vriksha')
      .map((m) => m.personId);
    expect(new Set(bvMembers).size).toBe(bvMembers.length);
  });

  it('only produces values the database constraints accept', () => {
    for (const p of small.people) {
      if (p.phoneE164) expect(p.phoneE164).toMatch(/^\+91[6-9][0-9]{9}$/);
      if (p.email) expect(p.email).toBe(p.email.toLowerCase());
      if (p.email) expect(p.email).toMatch(/@(example\.com|iwapp\.test)$/);
    }
  });

  it('uses unique UUIDv7 ids', () => {
    const ids = [...small.people, ...small.orgUnits].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids)
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('scales the people count but not the hierarchy', () => {
    const large = generate({ size: 'large', seed: 108 });
    expect(large.people).toHaveLength(10_000);
    expect(large.orgUnits).toHaveLength(39);
  });
});
