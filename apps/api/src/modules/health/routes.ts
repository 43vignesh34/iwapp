import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

const HealthResponse = z.object({ status: z.literal('ok') });

/**
 * Liveness: "is the process up and able to answer?" It deliberately checks nothing else.
 * If it checked Postgres, a database blip would make Cloud Run restart healthy API instances.
 * The Postgres check is /readyz, in T4.
 */
export const healthRoutes: FastifyPluginCallbackZod = (app, _options, done) => {
  app.get(
    '/healthz',
    // hide: operational endpoints stay out of the /api/v1 contract (ADR 0006).
    { schema: { hide: true, response: { 200: HealthResponse } } },
    () => ({ status: 'ok' as const }),
  );
  done();
};
