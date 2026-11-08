import { z } from 'zod';

/**
 * Every environment variable the API reads, validated once at startup.
 *
 * Why: if a variable is missing or malformed, the API should refuse to start with a clear
 * message, rather than boot and fail later, halfway through a request. Nothing else in the
 * API reads `process.env`. Code receives the typed `Env` object instead.
 */
export const EnvSchema = z.object({
  // TODO(human): define the three variables the API needs today.
  //
  //   NODE_ENV  one of 'development' | 'test' | 'production'; default 'development'
  //   PORT      env vars are always strings, so turn "4000" into the number 4000;
  //             must be a whole number from 1 to 65535; default 4000
  //   HOST      a non-empty string; default '127.0.0.1'
  //
  // The spec for "done" is env.test.ts. Run `pnpm --filter @iwapp/api test` and make it green.
  //
  // Zod pieces you'll need (https://zod.dev/api):
  //   z.enum([...])            only these exact strings are allowed
  //   z.coerce.number()        converts the input with Number(...) before checking it
  //   .int() .min(n) .max(n)   number checks
  //   z.string().min(1)        a string that isn't empty
  //   .default(value)          used when the variable is missing (undefined)
  //
  // Worked example, for a variable we don't need:
  //   LOG_LEVEL: z.enum(['debug', 'info', 'warn']).default('info'),
  //
  // Question to think about: env.test.ts expects PORT="" to be rejected, not to fall back to
  // the default. Why does that happen with z.coerce.number()? (Hint: what is Number("")?)
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
