import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

// Accept a caller's request ID only if it's short and plain. Anything else could inject
// fake lines into our logs or bloat them, so we generate our own ID instead.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

/** Fastify `genReqId`: reuse a safe incoming `x-request-id`, otherwise make a new one. */
export function requestIdFrom(req: IncomingMessage): string {
  const incoming = req.headers['x-request-id'];
  return typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}
