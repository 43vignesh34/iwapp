import type { Faker } from '@faker-js/faker';

/** 2026-01-01T00:00:00Z: a fixed clock for seed IDs. */
const BASE_MS = Date.UTC(2026, 0, 1);

/**
 * Deterministic UUIDv7s. The real `uuidv7()` reads the clock and a random source, so every run
 * would differ. Here the "clock" is a counter from a fixed date and the random bits come from the
 * seeded Faker, so `--seed=108` gives the same IDs every time, in insertion order.
 *
 * Layout (RFC 9562): 48-bit timestamp · version 7 · 12 random bits · variant 10 · 62 random bits.
 */
export function deterministicUuidv7(faker: Faker) {
  let tick = 0;
  return (): string => {
    const ts = (BASE_MS + tick++).toString(16).padStart(12, '0');
    const r = faker.string.hexadecimal({ length: 18, casing: 'lower', prefix: '' });
    const variant = faker.helpers.arrayElement(['8', '9', 'a', 'b']);
    return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-7${r.slice(0, 3)}-${variant}${r.slice(3, 6)}-${r.slice(6, 18)}`;
  };
}
