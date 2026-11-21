import { z } from 'zod';

/** Cookie and header names shared by the API and the web app. */
export const SESSION_COOKIES = {
  access: 'iw_access',
  refresh: 'iw_refresh',
  csrf: 'iw_csrf',
} as const;
export const CSRF_HEADER = 'x-csrf-token';

/**
 * What the signed-in user may do, as far as the UI is concerned: the web app shows a menu item
 * or button only if its capability is listed. The API still checks every request itself.
 */
export const CapabilitySchema = z.enum([
  'profile.view', // their own profile (everyone signed in)
  'members.view', // the member list (leaders, within scope; admins)
  'members.create',
  'users.manage', // invite and disable users (admins)
  'audit.view', // the audit log (admins)
]);
export type Capability = z.infer<typeof CapabilitySchema>;

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
  capabilities: z.array(CapabilitySchema),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** POST /api/v1/auth/test-login body. Only exists when AUTH_TEST_MODE=true (never in production). */
export const TestLoginBodySchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
});
