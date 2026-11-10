import type {} from '@fastify/rate-limit'; // adds the `rateLimit` route option's types
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../errors.ts';
import { setSessionCookies } from './cookies.ts';
import type { GoogleVerifier } from './google.ts';
import { signInWithGoogle } from './service.ts';

export const GoogleSignInBodySchema = z.object({
  /** The ID token that Google Identity Services hands the browser after the user picks an account. */
  credential: z.string().min(1).max(4096),
});

export interface GoogleRouteOptions {
  key: Uint8Array;
  verifyGoogleToken: GoogleVerifier;
}

/** POST /api/v1/auth/google: exchange a Google ID token for an IWApp session. */
export const googleRoutes: FastifyPluginCallbackZod<GoogleRouteOptions> = (app, options, done) => {
  app.post(
    '/auth/google',
    {
      config: {
        public: true,
        csrf: false, // no session yet, so no CSRF cookie; the Google token itself is the proof
        // Spec §6: sign-in is limited to 10 attempts per minute per IP address.
        rateLimit: { max: 10, timeWindow: '1 minute', keyGenerator: (request) => request.ip },
      },
      schema: { tags: ['auth'], body: GoogleSignInBodySchema, response: { 204: z.null() } },
    },
    async (request, reply) => {
      let identity;
      try {
        identity = await options.verifyGoogleToken(request.body.credential);
      } catch (error) {
        request.log.info({ err: error }, 'rejected Google ID token');
        throw new AppError('unauthenticated', 'GOOGLE_TOKEN_INVALID', 'Google sign-in failed.');
      }
      const session = await signInWithGoogle(
        app.db,
        { key: options.key, requestId: request.id },
        identity,
      );
      setSessionCookies(reply, session);
      return reply.code(204).send(null);
    },
  );
  done();
};
