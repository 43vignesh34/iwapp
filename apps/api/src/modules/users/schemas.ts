import { z } from 'zod';

export const InviteUserBodySchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  /** The existing person profile this login belongs to (spec §5: each user is one person). */
  personId: z.uuid(),
  isAdmin: z.boolean().default(false),
});
export type InviteUserBody = z.infer<typeof InviteUserBodySchema>;

export const UserSchema = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  email: z.email(),
  isAdmin: z.boolean(),
  status: z.enum(['invited', 'active', 'disabled']),
  lastLoginAt: z.iso.datetime({ offset: true }).nullable(),
});
export type User = z.infer<typeof UserSchema>;
