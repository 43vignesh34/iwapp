import { TestLoginBodySchema } from '@iwapp/shared';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { setSessionCookies } from './cookies.ts';
import { signInWithVerifiedEmail } from './service.ts';

/**
 * TEST-ONLY identity provider (spec §10): signs in any invited user by email, with no Google.
 * Lets integration and Playwright tests sign in as admin, leader or member.
 *
 * Registered only when AUTH_TEST_MODE=true, and loadEnv() refuses to start in production with
 * that flag set. Two independent guards, so one mistake can't expose it.
 */
export const testIdpRoutes: FastifyPluginCallbackZod<{ key: Uint8Array }> = (
  app,
  options,
  done,
) => {
  app.post(
    '/auth/test-login',
    {
      config: { public: true, csrf: false },
      schema: { tags: ['auth'], body: TestLoginBodySchema, response: { 204: z.null() } },
    },
    async (request, reply) => {
      const session = await signInWithVerifiedEmail(
        app.db,
        { key: options.key, requestId: request.id },
        request.body.email,
      );
      setSessionCookies(reply, session);
      return reply.code(204).send(null);
    },
  );
  done();
};
