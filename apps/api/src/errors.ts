/**
 * Errors that services throw. They describe WHAT went wrong in business terms; the problem
 * handler (plugins/problem.ts) decides the HTTP status. That keeps services usable outside HTTP:
 * the seed, the CSV import (M4) and background jobs call the same code.
 */
export type AppErrorKind =
  | 'unauthenticated' // 401: who are you?
  | 'forbidden' // 403: you may not
  | 'not_found' // 404
  | 'conflict' // 409: clashes with existing data
  | 'precondition_required' // 428: If-Match missing
  | 'precondition_failed' // 412: stale version (someone else saved first)
  | 'invalid'; // 400: valid shape, but breaks a business rule

export class AppError extends Error {
  readonly kind: AppErrorKind;
  /** Stable machine-readable code, e.g. 'NOT_INVITED'. Clients switch on this. */
  readonly code: string;

  constructor(kind: AppErrorKind, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
    this.code = code;
  }
}

export const STATUS_FOR_KIND: Record<AppErrorKind, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  precondition_required: 428,
  precondition_failed: 412,
  invalid: 400,
};
