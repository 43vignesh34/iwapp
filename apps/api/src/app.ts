import { createDb, type Db } from '@iwapp/db';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Env } from './config/env.ts';
import { healthRoutes } from './modules/health/index.ts';
import { registerDocs } from './plugins/docs.ts';
import { registerProblemHandlers } from './plugins/problem.ts';
import { requestIdFrom } from './plugins/request-id.ts';
import { registerSecurity } from './plugins/security.ts';
import { loggerOptions } from './telemetry/logger.ts';
import { registerRequestTelemetry } from './telemetry/request-hooks.ts';

/**
 * Builds the app without starting a server. Tests call this and use `app.inject()`, which
 * sends fake HTTP requests straight into Fastify, so there are no ports and no network.
 * server.ts calls this and then `listen()`.
 */
export async function buildApp(env: Env) {
  const app = Fastify({
    // Pino, with PII redaction (telemetry/logger.ts). Tests are silent unless LOG_LEVEL says otherwise.
    logger: loggerOptions(
      env.NODE_ENV === 'test' && env.LOG_LEVEL === 'info' ? 'silent' : env.LOG_LEVEL,
    ),
    genReqId: requestIdFrom,
    requestIdLogLabel: 'request_id',
    // We write one line per request ourselves (telemetry/request-hooks.ts).
    disableRequestLogging: true,
  }).withTypeProvider<ZodTypeProvider>();

  // Zod does validation (requests) and serialization (responses). A response field that isn't
  // in the schema is dropped, so nothing leaks by accident.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // One connection pool for the whole app. Creating it doesn't connect yet: connections open on
  // first query. Modules reach it as `app.db`; services pass it (or a transaction) to repos.
  const { db, pool } = createDb(env.DATABASE_URL);
  app.decorate('db', db);
  app.addHook('onClose', async () => {
    await pool.end();
  });

  registerRequestTelemetry(app);
  registerProblemHandlers(app);
  await registerSecurity(app);
  if (env.NODE_ENV !== 'production') {
    await registerDocs(app);
  }

  await app.register(healthRoutes);

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;

// Tell TypeScript that every Fastify instance has the `db` we decorated it with above.
declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}
