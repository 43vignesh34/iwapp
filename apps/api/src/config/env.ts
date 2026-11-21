import { LOCAL_DATABASE_URL } from '@iwapp/db';
import { z } from 'zod';

/**
 * Every environment variable the API reads, validated once at startup.
 *
 * Why: if a variable is missing or malformed, the API should refuse to start with a clear
 * message, rather than boot and fail later, halfway through a request. Nothing else in the
 * API reads `process.env`. Code receives the typed `Env` object instead.
 */
export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Env vars are always strings, so coerce "4000" → 4000. Note PORT="" is rejected, not
    // defaulted: `.default()` only applies to undefined, and Number("") is 0, which fails min(1).
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),

    // 127.0.0.1 keeps the API off your network locally; containers set HOST=0.0.0.0.
    HOST: z.string().min(1).default('127.0.0.1'),

    // Pino levels. 'silent' turns logging off (tests use it).
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    // postgres://user:password@host:port/database. Optional here; see the rule below.
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),

    // Signs the 15-minute access JWT. At least 32 characters (256 bits for HS256).
    // Optional here; required in production (see below). Generate one with:
    //   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
    JWT_SECRET: z.string().min(32).optional(),

    // OAuth client ID from Google Cloud (…apps.googleusercontent.com). Enables POST
    // /api/v1/auth/google; tokens minted for any other client ID are rejected. Not a secret.
    GOOGLE_CLIENT_ID: z.string().endsWith('.apps.googleusercontent.com').optional(),

    // How many proxies sit in front of the API (Cloudflare, Google's front end…). Fastify then
    // reads the real client IP from X-Forwarded-For, which rate limiting keys on. 0 = trust none.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

    // Enables POST /api/v1/auth/test-login (sign in by email, no Google). Automated tests only.
    AUTH_TEST_MODE: z.stringbool().default(false),
  })
  // Outside production, fall back to local defaults so `pnpm dev` works with no .env.
  // In production, anything missing or unsafe must stop the boot: failing later would be
  // more confusing, and failing open would be dangerous.
  .transform((env, ctx) => {
    const production = env.NODE_ENV === 'production';
    if (production) {
      if (!env.DATABASE_URL) {
        ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'Required in production' });
      }
      if (!env.GOOGLE_CLIENT_ID) {
        ctx.addIssue({
          code: 'custom',
          path: ['GOOGLE_CLIENT_ID'],
          message: 'Required in production',
        });
      }
      if (!env.JWT_SECRET) {
        ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'Required in production' });
      }
      // The test identity provider signs anyone in by email alone. It must be impossible to
      // switch on in production, so the production build refuses to start (spec §10).
      if (env.AUTH_TEST_MODE) {
        ctx.addIssue({
          code: 'custom',
          path: ['AUTH_TEST_MODE'],
          message: 'Must not be enabled in production: refusing to start',
        });
      }
    }
    return {
      ...env,
      DATABASE_URL: env.DATABASE_URL ?? LOCAL_DATABASE_URL,
      JWT_SECRET: env.JWT_SECRET ?? INSECURE_LOCAL_JWT_SECRET,
    };
  });

/** Outside production only. Anyone can read it in this file, so it protects nothing real. */
const INSECURE_LOCAL_JWT_SECRET = 'insecure-local-development-jwt-secret-not-for-prod';

export type Env = z.infer<typeof EnvSchema>;

/** Parses `source` (process.env by default) or throws an error listing every bad variable. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
