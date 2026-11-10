// Cloudflare Pages Function: forwards every /api/* request to the API on Cloud Run (spec §4).
// The browser only ever talks to the Pages origin, so session cookies stay first-party and
// no CORS is needed. API_ORIGIN (the Cloud Run URL) is set in the Pages project's settings.
//
// [[path]] is Pages' catch-all route syntax: it matches /api, /api/v1/me, /api/v1/members/…

/**
 * @param {{ request: Request, env: { API_ORIGIN?: string } }} context
 * @returns {Promise<Response>}
 */
export async function onRequest({ request, env }) {
  if (!env.API_ORIGIN) {
    return new Response('API_ORIGIN is not configured for this Pages project', { status: 502 });
  }
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, env.API_ORIGIN);

  const headers = new Headers(request.headers);
  // The real client IP, as Cloudflare saw it. We OVERWRITE any X-Forwarded-For the caller
  // sent, so nobody can fake their IP to dodge the sign-in rate limit through this proxy.
  headers.set('x-forwarded-for', request.headers.get('cf-connecting-ip') ?? '');
  headers.set('x-forwarded-proto', 'https');
  headers.set('x-forwarded-host', incoming.host);

  return fetch(target, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  });
}
