import { SESSION_COOKIES } from '@iwapp/shared';
import type { FastifyReply } from 'fastify';
import { ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS } from './tokens.ts';
import type { IssuedSession } from './service.ts';

/**
 * - HttpOnly: page JavaScript can't read the tokens, so an XSS bug can't steal the session.
 * - Secure: HTTPS only. Browsers treat http://localhost as secure, so local dev still works
 *   (Chrome and Firefox; Safari is stricter, so use Chrome or Firefox locally).
 * - SameSite=Strict: never sent on requests started by another site.
 * - Path: the refresh token only travels to /api/v1/auth, never with ordinary API calls.
 */
const base = { secure: true, sameSite: 'strict' as const };

export function setSessionCookies(reply: FastifyReply, session: IssuedSession) {
  reply
    .setCookie(SESSION_COOKIES.access, session.accessToken, {
      ...base,
      httpOnly: true,
      path: '/api',
      maxAge: ACCESS_TTL_SECONDS,
    })
    .setCookie(SESSION_COOKIES.refresh, session.refreshToken, {
      ...base,
      httpOnly: true,
      path: '/api/v1/auth',
      maxAge: REFRESH_TTL_SECONDS,
    })
    // Readable by the web app ON PURPOSE: it copies this into the X-CSRF-Token header.
    .setCookie(SESSION_COOKIES.csrf, session.csrfToken, {
      ...base,
      httpOnly: false,
      path: '/',
      maxAge: REFRESH_TTL_SECONDS,
    });
}

export function clearSessionCookies(reply: FastifyReply) {
  reply
    .clearCookie(SESSION_COOKIES.access, { ...base, path: '/api' })
    .clearCookie(SESSION_COOKIES.refresh, { ...base, path: '/api/v1/auth' })
    .clearCookie(SESSION_COOKIES.csrf, { ...base, path: '/' });
}
