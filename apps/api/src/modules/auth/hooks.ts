import cookie from '@fastify/cookie';
import { API_BASE_PATH, CSRF_HEADER, SESSION_COOKIES } from '@iwapp/shared';
import type { FastifyInstance } from 'fastify';
import { sendProblem } from '../../plugins/problem.ts';
import { findActor, type Actor } from './service.ts';
import { safeEqual, verifyAccessToken } from './tokens.ts';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Runs before every request (onRequest), in this order:
 *  1. Authenticate: access cookie → verified JWT → active user + live session → request.actor.
 *  2. Deny by default: any /api/v1 route needs an actor unless its config says `public: true`.
 *  3. CSRF: unsafe methods need X-CSRF-Token equal to the iw_csrf cookie (double submit).
 *     Another site can make a browser SEND our cookies, but it can't READ them to copy the value.
 *
 * Registered on the root app (not inside app.register), so it covers every route.
 */
export async function registerAuthentication(app: FastifyInstance, key: Uint8Array) {
  await app.register(cookie);
  app.decorateRequest('actor', null);

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith(API_BASE_PATH)) return; // /healthz, /readyz, /docs

    const claims = await verifyAccessToken(key, request.cookies[SESSION_COOKIES.access]);
    if (claims) {
      request.actor = await findActor(app.db, claims.userId, claims.familyId);
      if (request.actor) request.log = request.log.child({ user_id: request.actor.userId });
    }

    const config = request.routeOptions.config;
    if (!config.public && !request.actor) {
      return sendProblem(request, reply, {
        status: 401,
        code: 'UNAUTHENTICATED',
        detail: 'Sign in to continue.',
      });
    }

    if (UNSAFE_METHODS.has(request.method) && config.csrf !== false) {
      const header = request.headers[CSRF_HEADER];
      const cookieValue = request.cookies[SESSION_COOKIES.csrf];
      if (typeof header !== 'string' || !cookieValue || !safeEqual(header, cookieValue)) {
        return sendProblem(request, reply, {
          status: 403,
          code: 'CSRF_FAILED',
          detail: 'Missing or invalid CSRF token.',
        });
      }
    }
  });
}

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in user, or null for anonymous requests. Set by the auth hook. */
    actor: Actor | null;
  }
  interface FastifyContextConfig {
    /** Reachable without signing in (default false: deny by default). */
    public?: boolean;
    /** Set to false only for sign-in endpoints, which have no CSRF cookie yet. */
    csrf?: boolean;
  }
}
