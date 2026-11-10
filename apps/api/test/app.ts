import { generate, writeSeed } from '@iwapp/seed';
import { buildApp, type App, type AppOverrides } from '../src/app.ts';
import { loadEnv } from '../src/config/env.ts';
import { freshDatabase } from './database.ts';

/** A fresh, seeded database plus an app with the test identity provider switched on. */
export async function seededApp(overrides: AppOverrides = {}) {
  const database = await freshDatabase();
  await writeSeed(database.db, generate({ size: 'small', seed: 108 }));
  const app: App = await buildApp(
    loadEnv({ NODE_ENV: 'test', DATABASE_URL: database.url, AUTH_TEST_MODE: 'true' }),
    overrides,
  );
  return {
    app,
    database,
    close: async () => {
      await app.close();
      await database.close();
    },
  };
}
