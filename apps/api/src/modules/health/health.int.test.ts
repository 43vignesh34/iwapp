import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDatabase } from '../../../test/database.ts';
import { buildApp, type App } from '../../app.ts';
import { loadEnv } from '../../config/env.ts';

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: App;
beforeAll(async () => {
  database = await freshDatabase();
  app = await buildApp(loadEnv({ NODE_ENV: 'test', DATABASE_URL: database.url }));
});
afterAll(async () => {
  await app.close();
  await database.close();
});

describe('GET /readyz (real Postgres)', () => {
  it('returns 200 when the database answers', async () => {
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
