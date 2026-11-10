import { randomUUID } from 'node:crypto';
import { createDb } from '@iwapp/db';
import pg from 'pg';
import { inject } from 'vitest';

/**
 * A brand-new database, already migrated, for one test file. Call it in `beforeAll` and call
 * `close()` in `afterAll`. Nothing is shared between files, so there are no fixtures that one
 * test can break for another (spec §10).
 */
export async function freshDatabase() {
  const adminUrl = inject('pgAdminUrl');
  const name = `test_${randomUUID().replaceAll('-', '')}`;

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE "${inject('pgTemplateDatabase')}"`);
  } finally {
    await admin.end();
  }

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const { db, pool } = createDb(url.toString(), { maxConnections: 4 });
  return {
    url: url.toString(),
    db,
    close: () => pool.end(),
  };
}
