import { createDb, type Db } from '@iwapp/db';
import rateLimit from '@fastify/rate-limit';
import Fastify, { LogController } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Env } from './config/env.ts';
import { API_BASE_PATH } from '@iwapp/shared';
import {
  authRoutes,
  createGoogleVerifier,
  googleRoutes,
  registerAuthentication,
  secretKey,
  testIdpRoutes,
  type GoogleVerifier,
} from './modules/auth/index.ts';
import { healthRoutes } from './modules/health/index.ts';
import { usersRoutes } from './modules/users/index.ts';
import { registerActorScope } from './plugins/actor-scope.ts';
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
/** Test seams: replace outside services that tests can't reach (Google's key server). */
export interface AppOverrides {
  verifyGoogleToken?: GoogleVerifier;
}

export async function buildApp(env: Env, overrides: AppOverrides = {}) {
  const app = Fastify({
    // Pino, with PII redaction (telemetry/logger.ts). Tests are silent unless LOG_LEVEL says otherwise.
    logger: loggerOptions(
      env.NODE_ENV === 'test' && env.LOG_LEVEL === 'info' ? 'silent' : env.LOG_LEVEL,
    ),
    genReqId: requestIdFrom,
    // Log label `request_id` (spec §9). No built-in per-request lines: we write one line per
    // request ourselves (telemetry/request-hooks.ts).
    logController: new LogController({
      requestIdLogLabel: 'request_id',
      disableRequestLogging: true,
    }),
    // Behind Cloudflare and Cloud Run the TCP peer is a proxy. Trust exactly the N nearest hops
    // (TRUST_PROXY_HOPS), so request.ip is the real client and can't be spoofed by a caller
    // adding their own X-Forwarded-For entries further out.
    trustProxy: (_address, hop) => hop < env.TRUST_PROXY_HOPS,
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

  // Authentication, deny-by-default and CSRF for everything under /api/v1.
  const key = secretKey(env.JWT_SECRET);
  await registerAuthentication(app, key);
  registerActorScope(app); // leader scope, once per request, for authorize()

  // Rate limits (spec §6): 300 requests a minute per signed-in user (per IP when anonymous).
  // Registered AFTER authentication so the key can use request.actor. Sign-in routes set a
  // stricter per-IP limit in their own config. Counters live in this instance's memory, so with
  // up to 3 Cloud Run instances the effective limit is up to 3× higher: fine at our scale.
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.actor?.userId ?? request.ip,
  });

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: API_BASE_PATH, key });
  await app.register(usersRoutes, { prefix: API_BASE_PATH });
  const verifyGoogleToken =
    overrides.verifyGoogleToken ??
    (env.GOOGLE_CLIENT_ID ? createGoogleVerifier(env.GOOGLE_CLIENT_ID) : undefined);
  if (verifyGoogleToken) {
    await app.register(googleRoutes, { prefix: API_BASE_PATH, key, verifyGoogleToken });
  }
  if (env.AUTH_TEST_MODE) {
    // Never in production: loadEnv() refuses to start with AUTH_TEST_MODE there.
    app.log.warn('AUTH_TEST_MODE is on: POST /api/v1/auth/test-login signs anyone in by email');
    await app.register(testIdpRoutes, { prefix: API_BASE_PATH, key });
  }

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;

// Tell TypeScript that every Fastify instance has the `db` we decorated it with above.
declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}
