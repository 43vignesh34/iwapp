import { runMigrations } from '@iwapp/db';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

/**
 * Runs once per `pnpm test:int`, before any test file:
 * 1. Start a throwaway Postgres 17 in Docker (Testcontainers), the same major version as Neon.
 * 2. Apply every migration to a TEMPLATE database, once.
 * 3. Hand the connection details to the test files, which each clone the template
 *    (CREATE DATABASE … TEMPLATE …, ~50 ms) so files can run in parallel without sharing data.
 */
export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('postgres:17')
    .withDatabase(TEMPLATE_DATABASE)
    .withUsername('iwapp')
    .withPassword('iwapp')
    .start();

  await runMigrations(container.getConnectionUri());

  const admin = new URL(container.getConnectionUri());
  admin.pathname = '/postgres';
  project.provide('pgAdminUrl', admin.toString());
  project.provide('pgTemplateDatabase', TEMPLATE_DATABASE);

  return async () => {
    await container.stop();
  };
}

const TEMPLATE_DATABASE = 'iwapp_template';

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string;
    pgTemplateDatabase: string;
  }
}
