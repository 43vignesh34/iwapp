import { z } from 'zod';

/** Cookie and header names shared by the API and the web app. */
export const SESSION_COOKIES = {
  access: 'iw_access',
  refresh: 'iw_refresh',
  csrf: 'iw_csrf',
} as const;
export const CSRF_HEADER = 'x-csrf-token';

/** GET /api/v1/me: who is signed in and what they may do. The web app builds its menus from
 *  `capabilities`; the API still checks every request on its own (spec §7). */
export const MeResponseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    email: z.email(),
    isAdmin: z.boolean(),
  }),
  person: z.object({
    id: z.uuid(),
    displayName: z.string(),
  }),
  capabilities: z.array(z.string()),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** POST /api/v1/auth/test-login body. Only exists when AUTH_TEST_MODE=true (never in production). */
export const TestLoginBodySchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
});
