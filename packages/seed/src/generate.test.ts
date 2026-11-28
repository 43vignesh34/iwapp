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

  it('builds 3 circles, 9 sectors and 36 BVs (ADR 0013)', () => {
    const count = (kind: string) => small.orgUnits.filter((u) => u.kind === kind).length;
    expect([count('circle'), count('sector'), count('bhakti_vriksha')]).toEqual([3, 9, 36]);
  });

  it('nests circle → sector → BV', () => {
    const kindOf = new Map(small.orgUnits.map((u) => [u.id, u.kind]));
    for (const u of small.orgUnits) {
      const parentKind = u.parentId ? kindOf.get(u.parentId) : undefined;
      const expected = { circle: undefined, sector: 'circle', bhakti_vriksha: 'sector' }[u.kind];
      expect(parentKind, u.name).toBe(expected);
    }
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
    expect(large.orgUnits).toHaveLength(48);
  });
});
