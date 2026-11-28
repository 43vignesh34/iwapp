/**
 * Errors that services throw. They describe WHAT went wrong in business terms; the problem
 * handler (plugins/problem.ts) decides the HTTP status. That keeps services usable outside HTTP:
 * the seed, the CSV import (M4) and background jobs call the same code.
 */

export type Errors =
  | 'bad_request'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'precondition_required'
  | 'precondition_failed'
  | 'invalid';

export class AppError extends Error {
  readonly kind: Errors;
  readonly code: string;
  constructor(kind: Errors, code: string, message: string) {
    super(message);
    this.kind = kind;
    this.code = code;
  }
}

export const STATUS_FOR_KIND: Record<Errors, number> = {
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  precondition_required: 428,
  precondition_failed: 412,
  invalid: 400,
};
