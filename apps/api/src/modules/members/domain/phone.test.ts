import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone.ts';

describe('normalizePhone', () => {
  it.each([
    ['98765 43210', '+919876543210'],
    ['9876543210', '+919876543210'],
    ['098765-43210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['+91-98765-43210', '+919876543210'],
    ['0091 98765 43210', '+919876543210'],
    ['(+91) 98765.43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['+44 20 7946 0958', '+442079460958'], // a UK number stays as given
  ])('reads %j as %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    ['12345', 'too short'],
    ['5876543210', 'Indian mobiles start with 6–9'],
    ['+91 12345 67890', 'Indian mobile after +91 must start with 6–9'],
    ['98765 4321x', 'letters'],
    ['', 'empty'],
    ['+0 123 456 789', 'country codes never start with 0'],
  ])('rejects %j (%s)', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});
