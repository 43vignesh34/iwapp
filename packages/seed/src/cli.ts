// `pnpm seed --size=small --seed=108 [--reset] [--allow-remote]`
import { parseArgs } from 'node:util';
import { createDb, LOCAL_DATABASE_URL } from '@iwapp/db';
import { SIZES, type SeedSize } from './catalog.ts';
import { generate } from './generate.ts';
import { writeSeed } from './write.ts';

const { values } = parseArgs({
  options: {
    size: { type: 'string', default: 'small' },
    seed: { type: 'string', default: '108' },
    reset: { type: 'boolean', default: false },
    'allow-remote': { type: 'boolean', default: false },
  },
});

const size = values.size as SeedSize;
if (!(size in SIZES)) throw new Error(`--size must be one of: ${Object.keys(SIZES).join(', ')}`);
const seed = Number(values.seed);
if (!Number.isInteger(seed)) throw new Error('--seed must be an integer');

// Guard rails: synthetic data must never land in production (spec §10).
if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed: NODE_ENV=production. The seed never runs in production.');
}
const url = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1'].includes(host) && !values['allow-remote']) {
  throw new Error(`Refusing to seed remote host "${host}". Pass --allow-remote for staging.`);
}

const data = generate({ size, seed });
const { db, pool } = createDb(url);
try {
  await writeSeed(db, data, { reset: values.reset });
} finally {
  await pool.end();
}
console.log(
  `Seeded ${host} (size=${size}, seed=${String(seed)}): ${String(data.people.length)} people, ` +
    `${String(data.orgUnits.length)} units, ${String(data.memberships.length)} memberships, ` +
    `${String(data.appUsers.length)} test users.`,
);
