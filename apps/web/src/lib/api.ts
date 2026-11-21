import { CSRF_HEADER, ProblemSchema, SESSION_COOKIES, type Problem } from '@iwapp/shared';
import type { z } from 'zod';

/** An error response from the API, carrying its RFC 9457 problem body when there is one. */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem | undefined;

  constructor(status: number, problem: Problem | undefined) {
    super(problem?.detail ?? problem?.title ?? `Request failed (${String(status)})`);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
  }

  get code(): string | undefined {
    return this.problem?.code;
  }
}

function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function headersFor(method: string, ifMatch?: number, hasBody?: boolean): Headers {
  const headers = new Headers({ accept: 'application/json' });
  if (hasBody) headers.set('content-type', 'application/json');
  // CSRF double submit: copy the readable iw_csrf cookie into the header on writes.
  const csrf = readCookie(SESSION_COOKIES.csrf);
  if (UNSAFE.has(method) && csrf) headers.set(CSRF_HEADER, csrf);
  if (ifMatch !== undefined) headers.set('if-match', `"${String(ifMatch)}"`);
  return headers;
}

/**
 * ONE refresh at a time, shared by every caller. If two requests hit 401 together, both wait
 * for the same refresh. Two parallel refreshes with the same token would look like token
 * theft to the API and sign the user out (ADR 0010).
 */
let refreshing: Promise<boolean> | null = null;
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/v1/auth/refresh', {
    method: 'POST',
    headers: headersFor('POST'),
  })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export interface RequestOptions<S extends z.ZodType | undefined> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** The version being edited; sent as If-Match. */
  ifMatch?: number;
  /** Validates the response body. The same schemas the API serialises with (@iwapp/shared). */
  schema?: S;
}

type Result<S> = S extends z.ZodType ? z.infer<S> : null;

/**
 * Calls the API on our own origin (/api/v1/…). Cookies travel automatically. On a 401 it
 * refreshes the session once and retries; if that fails, the 401 surfaces and the app shows
 * the sign-in page.
 */
export async function api<S extends z.ZodType | undefined = undefined>(
  path: string,
  options: RequestOptions<S> = {},
): Promise<Result<S>> {
  const method = options.method ?? 'GET';
  const send = () =>
    fetch(`/api/v1${path}`, {
      method,
      headers: headersFor(method, options.ifMatch, options.body !== undefined),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

  let res = await send();
  if (res.status === 401 && !path.startsWith('/auth/') && (await refreshSession())) {
    res = await send();
  }

  if (!res.ok) {
    const parsed = ProblemSchema.safeParse(await res.json().catch(() => undefined));
    throw new ApiError(res.status, parsed.success ? parsed.data : undefined);
  }
  if (res.status === 204 || !options.schema) return null as Result<S>;
  return options.schema.parse(await res.json()) as Result<S>;
}
