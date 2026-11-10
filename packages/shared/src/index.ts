// @iwapp/shared: code used by both the API and the web app (Zod schemas, types, constants).

/** Every API route lives under this prefix (CLAUDE.md → Coding conventions → API). */
export const API_BASE_PATH = '/api/v1';

export * from './auth.ts';
export * from './problem.ts';
export * from './members.ts';
