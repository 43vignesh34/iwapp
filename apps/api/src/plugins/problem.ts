import { STATUS_CODES } from 'node:http';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

/**
 * RFC 9457 "Problem Details for HTTP APIs": every error response from IWApp has this shape,
 * so the web app (and the phase 2 mobile app) handle errors in one way.
 * https://www.rfc-editor.org/rfc/rfc9457
 */
export interface Problem {
  /** "about:blank" means the HTTP status says it all. `code` is what clients switch on. */
  type: string;
  title: string;
  status: number;
  /** Stable, machine-readable, SCREAMING_SNAKE. Never change one once clients rely on it. */
  code: string;
  detail?: string;
  /** Which request failed: lets a user report it and lets us find its logs and trace. */
  requestId: string;
  /** Validation failures only: which fields were wrong. */
  errors?: { path: string; message: string }[];
}

export function sendProblem(
  request: FastifyRequest,
  reply: FastifyReply,
  problem: Omit<Problem, 'type' | 'title' | 'requestId'>,
) {
  const body: Problem = {
    type: 'about:blank',
    title: STATUS_CODES[problem.status] ?? 'Error',
    requestId: request.id,
    ...problem,
  };
  return reply.code(problem.status).type('application/problem+json').send(body);
}

/** "Unsupported Media Type" → "UNSUPPORTED_MEDIA_TYPE" */
function codeForStatus(status: number): string {
  return (STATUS_CODES[status] ?? 'Error').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

/**
 * Registered directly on the root app, not inside `app.register()`, so it applies to every
 * route. (Fastify encapsulation: a handler set inside a registered plugin applies only to that
 * plugin's routes.)
 */
export function registerProblemHandlers(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) =>
    sendProblem(request, reply, {
      status: 404,
      code: 'NOT_FOUND',
      detail: `Route ${request.method} ${request.url.split('?')[0] ?? ''} not found`,
    }),
  );

  app.setErrorHandler((error: FastifyError, request, reply) => {
    // 1. Zod rejected the request's body, query, params or headers.
    if (hasZodFastifySchemaValidationErrors(error)) {
      return sendProblem(request, reply, {
        status: 400,
        code: 'VALIDATION_FAILED',
        detail: `Invalid request ${error.validationContext ?? 'input'}`,
        errors: error.validation.map((v) => ({
          path: v.instancePath || '/',
          message: v.message ?? 'Invalid value',
        })),
      });
    }

    // 2. A client error Fastify already understands (bad JSON, wrong content type, too large…).
    //    These messages come from Fastify itself, so they're safe to show.
    const status = error.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      return sendProblem(request, reply, {
        status,
        code: codeForStatus(status),
        detail: error.message,
      });
    }

    // 3. Anything else is our bug. Log everything; tell the client nothing internal, since an
    //    error message can contain SQL, file paths or personal data.
    request.log.error({ err: error }, 'unhandled error');
    return sendProblem(request, reply, { status: 500, code: 'INTERNAL_ERROR' });
  });
}
