import { z } from 'zod';

export const PersonStatusSchema = z.enum(['active', 'inactive', 'moved', 'deceased', 'archived']);

/** One row of the member list. No contact details: lists show only what's needed to find
 *  someone (data minimisation, spec §6). Contact details are on the profile, per permission. */
export const MemberSummarySchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  legalName: z.string(),
  locality: z.string(),
  status: PersonStatusSchema,
  /** The person's current Bhakti Vriksha, if any. */
  bhaktiVriksha: z.string().nullable(),
});
export type MemberSummary = z.infer<typeof MemberSummarySchema>;

export const MemberListQuerySchema = z.object({
  /** Name search (case-insensitive, contains). Typo-tolerant search arrives in M1 (pg_trgm). */
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Opaque: pass back the previous page's `nextCursor`. */
  cursor: z.string().max(500).optional(),
});

export const MemberListResponseSchema = z.object({
  items: z.array(MemberSummarySchema),
  nextCursor: z.string().nullable(),
});
export type MemberListResponse = z.infer<typeof MemberListResponseSchema>;

export const MemberUnitSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(['sector', 'circle', 'bhakti_vriksha']),
  role: z.enum(['member', 'leader', 'co_leader']),
});

export const MemberDetailSchema = z.object({
  id: z.uuid(),
  legalName: z.string(),
  displayName: z.string(),
  locality: z.string(),
  email: z.email().nullable(),
  phoneE164: z.string().nullable(),
  status: PersonStatusSchema,
  units: z.array(MemberUnitSchema),
  /** Optimistic-locking version. Also sent as the ETag header; send it back in If-Match. */
  version: z.number().int(),
});
export type MemberDetail = z.infer<typeof MemberDetailSchema>;

/**
 * PATCH /api/v1/members/{id}: the fields a member may correct on their own profile (spec §6).
 * Send only what changed. `null` clears an optional field. The phone number may be typed any
 * common Indian way ("98765 43210", "+91 98765-43210"); the API normalises it to E.164.
 */
export const UpdateMemberBodySchema = z
  .object({
    displayName: z.string().trim().min(1).max(100),
    locality: z.string().trim().min(1).max(100),
    email: z
      .email()
      .transform((e) => e.toLowerCase())
      .nullable(),
    phone: z.string().trim().min(7).max(25).nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' });
export type UpdateMemberBody = z.infer<typeof UpdateMemberBodySchema>;
