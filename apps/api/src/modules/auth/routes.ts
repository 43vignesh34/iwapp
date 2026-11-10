import { MeResponseSchema, SESSION_COOKIES } from '@iwapp/shared';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../errors.ts';
import { capabilitiesFor } from '../policy/index.ts';
import { clearSessionCookies, setSessionCookies } from './cookies.ts';
import { refreshSession, signOut } from './service.ts';

export interface AuthRouteOptions {
  key: Uint8Array;
}

/** /api/v1/auth/refresh, /api/v1/auth/logout and /api/v1/me. Sign-in routes live in their own
 *  files (Google in S5, the test identity provider in test-idp.ts). */
export const authRoutes: FastifyPluginCallbackZod<AuthRouteOptions> = (app, options, done) => {
  app.post(
    '/auth/refresh',
    {
      // Public: the access token has usually expired by the time we get here.
      // Still CSRF-protected (the default), because it changes server state.
      config: { public: true },
      schema: { tags: ['auth'], response: { 204: z.null() } },
    },
    async (request, reply) => {
      try {
        const session = await refreshSession(
          app.db,
          { key: options.key, requestId: request.id },
          request.cookies[SESSION_COOKIES.refresh],
        );
        setSessionCookies(reply, session);
        return await reply.code(204).send(null);
      } catch (error) {
        if (error instanceof AppError) clearSessionCookies(reply);
        throw error;
      }
    },
  );

  app.post(
    '/auth/logout',
    { schema: { tags: ['auth'], response: { 204: z.null() } } },
    async (request, reply) => {
      const actor = request.actor;
      if (actor) await signOut(app.db, actor.userId);
      clearSessionCookies(reply);
      return reply.code(204).send(null);
    },
  );

  app.get('/me', { schema: { tags: ['auth'], response: { 200: MeResponseSchema } } }, (request) => {
    const actor = request.actor;
    if (!actor) throw new AppError('unauthenticated', 'UNAUTHENTICATED', 'Sign in to continue.');
    return {
      user: { id: actor.userId, email: actor.email, isAdmin: actor.isAdmin },
      person: { id: actor.personId, displayName: actor.displayName },
      capabilities: capabilitiesFor(actor),
    };
  });

  done();
};
