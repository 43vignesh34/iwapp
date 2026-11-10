import type { FastifyReply, FastifyRequest } from 'fastify';
import type { LoggerOptions } from 'pino';

/**
 * Keys whose values must never reach a log line (CLAUDE.md → Security; spec §9).
 * Matching is by key name, so `{ member: { email } }` is caught as well as `{ email }`.
 *
 * Redaction is the safety net, not the plan: code should not log personal data at all.
 * Note the depth limit: keys nested more than three levels down are NOT matched.
 */
export const SENSITIVE_KEYS = [
  'phone',
  'phoneE164',
  'phone_e164',
  'whatsapp',
  'whatsappE164',
  'whatsapp_e164',
  'email',
  'dob',
  'dateOfBirth',
  'notes',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'credential',
  'cookie',
  'authorization',
  'x-csrf-token',
] as const;

export const REDACTED = '[REDACTED]';

/** "email" → ["email", "*.email", "*.*.email"]; "x-csrf-token" → bracket syntax. */
function redactPathsFor(key: string): string[] {
  const segment = /^[A-Za-z_$][\w$]*$/.test(key) ? key : `["${key}"]`;
  const join = (prefix: string) =>
    segment.startsWith('[') ? `${prefix}${segment}` : `${prefix}.${segment}`;
  return [segment, join('*'), join('*.*')];
}

export const REDACT_PATHS = SENSITIVE_KEYS.flatMap(redactPathsFor);

/** Only what we need about a request. Never the query string: `?q=9876543210` is PII. */
function serializeRequest(request: FastifyRequest) {
  return {
    method: request.method,
    route: request.routeOptions.url,
    path: request.url.split('?')[0],
  };
}

function serializeReply(reply: FastifyReply) {
  return { statusCode: reply.statusCode };
}

/** Pino options for Fastify. Logs are JSON on stdout (Cloud Logging reads it) and, via the
 *  OpenTelemetry Pino instrumentation, also shipped to Loki with trace_id/span_id attached. */
export function loggerOptions(level: string): LoggerOptions {
  return {
    level,
    redact: { paths: REDACT_PATHS, censor: REDACTED },
    serializers: { req: serializeRequest, res: serializeReply },
  };
}
