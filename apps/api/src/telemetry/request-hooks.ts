import { trace } from '@opentelemetry/api';
import type { FastifyInstance } from 'fastify';
import { REDACTED } from './logger.ts';

/**
 * Per-request telemetry, on top of what OpenTelemetry's auto-instrumentation gives us.
 *
 * 1. Name the HTTP span after the route: "GET /api/v1/members/:id", not just "GET".
 *    We use the route *pattern*, never the real URL, so IDs and query strings (which can hold
 *    personal data, and would create one span name per member) stay out of span names.
 * 2. Scrub the query string from the span. The HTTP instrumentation records it as `url.query`,
 *    and search URLs (`?q=9876543210`) carry personal data that must not leave for Grafana.
 * 3. One log line per request, written after the response, with the fields spec §9 asks for.
 *    (Fastify's default is two lines per request; one keeps us well inside Grafana's free log
 *    quota.) trace_id and span_id are added to every line by the OTel Pino instrumentation.
 */
export function registerRequestTelemetry(app: FastifyInstance) {
  // Callback-style hooks (call done()) because neither does anything asynchronous.
  app.addHook('onRequest', (request, _reply, done) => {
    const route = request.routeOptions.url;
    const span = trace.getActiveSpan();
    if (span) {
      if (route) {
        span.updateName(`${request.method} ${route}`);
        span.setAttribute('http.route', route);
      }
      if (request.url.includes('?')) span.setAttribute('url.query', REDACTED);
    }
    done();
  });

  app.addHook('onResponse', (request, reply, done) => {
    request.log.info(
      { req: request, res: reply, duration_ms: Math.round(reply.elapsedTime * 100) / 100 },
      'request completed',
    );
    done();
  });
}
