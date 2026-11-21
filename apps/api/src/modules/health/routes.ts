import { sql } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sendProblem } from '../../plugins/problem.ts';

const HealthResponse = z.object({ status: z.literal('ok') });

/** How long /readyz waits for Postgres before saying "not ready". Uptime checks run every 5 min
 *  (spec §9), and a cold Neon database takes about 1 s to wake. */
const DATABASE_CHECK_TIMEOUT_MS = 3_000;

export const healthRoutes: FastifyPluginCallbackZod = (app, _options, done) => {
  /**
   * Liveness: "is the process up and able to answer?" It deliberately checks nothing else.
   * If it checked Postgres, a database blip would make Cloud Run restart healthy API instances.
   */
  app.get(
    '/healthz',
    // hide: operational endpoints stay out of the /api/v1 contract (ADR 0006).
    { schema: { hide: true, response: { 200: HealthResponse } } },
    () => ({ status: 'ok' as const }),
  );

  /**
   * Readiness: "can this instance do useful work right now?" Runs `select 1` against Postgres.
   * Failing it should stop traffic reaching the instance, not restart it.
   */
  app.get(
    '/readyz',
    { schema: { hide: true, response: { 200: HealthResponse } } },
    async (request, reply) => {
      try {
        await withTimeout(app.db.execute(sql`select 1`), DATABASE_CHECK_TIMEOUT_MS);
        return { status: 'ok' as const };
      } catch (error) {
        request.log.warn({ err: error }, 'readiness check failed: database unreachable');
        return sendProblem(request, reply, {
          status: 503,
          code: 'NOT_READY',
          detail: 'Database unreachable',
        });
      }
    },
  );

  done();
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out after ${String(ms)} ms`));
    }, ms);
    promise.then(resolve, reject).finally(() => {
      clearTimeout(timer);
    });
  });
}
