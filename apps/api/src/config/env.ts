import { z } from 'zod';

/**
 * Every environment variable the API reads, validated once at startup.
 *
 * Why: if a variable is missing or malformed, the API should refuse to start with a clear
 * message, rather than boot and fail later, halfway through a request. Nothing else in the
 * API reads `process.env`. Code receives the typed `Env` object instead.
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Env vars are always strings, so coerce "4000" → 4000. Note PORT="" is rejected, not
  // defaulted: `.default()` only applies to undefined, and Number("") is 0, which fails min(1).
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  // 127.0.0.1 keeps the API off your network locally; containers set HOST=0.0.0.0.
  HOST: z.string().min(1).default('127.0.0.1'),
});

export type Env = z.infer<typeof EnvSchema>;

/** Parses `source` (process.env by default) or throws an error listing every bad variable. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
