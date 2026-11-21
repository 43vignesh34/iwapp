import { describe, expect, it } from 'vitest';
import { diffFields } from './service.ts';

describe('diffFields', () => {
  it('lists only the fields whose value changed, with old and new values', () => {
    const before = { displayName: 'Asha', locality: 'Hoodi', phoneE164: null };
    expect(diffFields(before, { displayName: 'Asha', locality: 'Varthur' })).toEqual({
      locality: { old: 'Hoodi', new: 'Varthur' },
    });
  });

  it('records setting a value that was null', () => {
    const before: { phoneE164: string | null } = { phoneE164: null };
    expect(diffFields(before, { phoneE164: '+919876543210' })).toEqual({
      phoneE164: { old: null, new: '+919876543210' },
    });
  });

  it('ignores fields that were not supplied', () => {
    expect(diffFields({ a: 1, b: 2 }, {})).toEqual({});
  });
});
