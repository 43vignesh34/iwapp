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

/**
 * Builds the app without starting a server. Tests call this and use `app.inject()`, which
 * sends fake HTTP requests straight into Fastify, so there are no ports and no network.
 * server.ts calls this and then `listen()`.
 */
export async function buildApp(env: Env) {
  const app = Fastify({
    // T3 replaces this with Pino plus PII redaction and trace IDs.
    logger: env.NODE_ENV !== 'test',
    genReqId: requestIdFrom,
  }).withTypeProvider<ZodTypeProvider>();

  // Zod does validation (requests) and serialization (responses). A response field that isn't
  // in the schema is dropped, so nothing leaks by accident.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  registerProblemHandlers(app);
  await registerSecurity(app);
  if (env.NODE_ENV !== 'production') {
    await registerDocs(app);
  }

  await app.register(healthRoutes);

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
