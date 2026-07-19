import { z } from 'zod';
import { AccountStatus } from '@edrion/shared-types';
import {
  emailSchema,
  paginationQuerySchema,
  reasonSchema,
  sortQuerySchema,
  versionSchema,
  zEnumFromConst,
} from './common';
import { lenientPhoneSchema } from './geo/validators';

/**
 * Institution-Portal USER MANAGEMENT (Phase 11) request/response contracts — the tenant-facing
 * directory over `institution_users` (+ `institution_user_roles`, `campus_user_access`, and the
 * directGrants/directDenies overrides on the user row). Distinct from the platform-side
 * `institution-users.ts` in this package (that one is the Super Admin managing tenants and uses the
 * `inst.*` catalogue). These contracts are `portal*`/`PortalUser*`-prefixed to avoid collision.
 *
 * Reads need `users.view`; inviting needs `users.invite`; editing/disabling needs the sensitive
 * `users.manage`; assigning roles/campus access/overrides needs the sensitive `users.manage_roles`.
 * The institution is always the principal's — never taken from the body.
 */

const portalUserStatusSchema = zEnumFromConst(AccountStatus);

const fullName = z.string().trim().min(2, 'Required').max(160);
/** Normalizes to E.164 when parseable; tolerates legacy values for existing records. */
const phone = lenientPhoneSchema;
const roleKeys = z.array(z.string().trim().min(1).max(64)).max(40);
const campusIds = z.array(z.string().uuid()).max(200);
const grantKeys = z.array(z.string().trim().min(1).max(80)).max(200);

export const portalUsersListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: portalUserStatusSchema.optional(),
  roleKey: z.string().trim().max(64).optional(),
  campusId: z.string().uuid().optional(),
  mfaEnrolled: z.coerce.boolean().optional(),
  /** Filter to users whose effective permissions include this catalogue key. */
  permission: z.string().trim().max(80).optional(),
  /** When true, only users linked from a staff directory row (staff.institution_user_id). */
  provisionedFromStaff: z.coerce.boolean().optional(),
});
export type PortalUsersListQuery = z.infer<typeof portalUsersListQuerySchema>;

/** Invite (create) an institution user. At least one role is required — users with no roles cannot use the portal. */
export const invitePortalUserSchema = z.object({
  email: emailSchema,
  fullName,
  phone,
  roleKeys: roleKeys.min(1, 'Assign at least one role'),
  campusIds: campusIds.default([]),
  requireMfa: z.boolean().default(false),
});
export type InvitePortalUserInput = z.infer<typeof invitePortalUserSchema>;

/** Edit profile + lifecycle of an institution user (not roles/access — that's the access PUT). */
export const updatePortalUserSchema = z
  .object({
    fullName: fullName.optional(),
    phone,
    status: portalUserStatusSchema.optional(),
    /** Required when setting status to `disabled` (suspend). Prefer POST /suspend. */
    disabledReason: reasonSchema.optional(),
    requireMfa: z.boolean().optional(),
    version: versionSchema,
  })
  .superRefine((v, ctx) => {
    if (v.status === AccountStatus.Disabled && !v.disabledReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A reason is required to suspend a user (min 5 characters).',
        path: ['disabledReason'],
      });
    }
  });
export type UpdatePortalUserInput = z.infer<typeof updatePortalUserSchema>;

/** Suspend (disable) or unsuspend (re-enable) a portal user — reason is always required. */
export const portalUserStatusActionSchema = z.object({
  reason: reasonSchema,
  version: versionSchema,
});
export type PortalUserStatusActionInput = z.infer<typeof portalUserStatusActionSchema>;

/**
 * Replace a user's role assignment, campus access and permission overrides in one version-guarded
 * call (the access drawer). Each list fully replaces the current set. The service validates role
 * keys (default ∪ custom), campus ids (must belong to the institution) and override keys (catalogue).
 */
export const setPortalUserAccessSchema = z.object({
  roleKeys: roleKeys.min(1, 'Assign at least one role'),
  campusIds: campusIds.default([]),
  directGrants: grantKeys.default([]),
  directDenies: grantKeys.default([]),
  version: versionSchema,
});
export type SetPortalUserAccessInput = z.infer<typeof setPortalUserAccessSchema>;
