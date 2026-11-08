import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';

/**
 * Standard security headers (spec §6) on every response: CSP, HSTS, nosniff, frame denial…
 * Helmet's defaults are strict. We loosen nothing here. The web app's own CSP is set at the
 * Cloudflare edge in T10.
 */
export async function registerSecurity(app: FastifyInstance) {
  await app.register(helmet);
}
