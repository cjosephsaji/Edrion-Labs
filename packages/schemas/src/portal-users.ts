import { z } from 'zod';
import { AccountStatus } from '@edrion/shared-types';
import { emailSchema, paginationQuerySchema, sortQuerySchema, versionSchema, zEnumFromConst } from './common';
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
  mfa: z.coerce.boolean().optional(),
  /** Filter to users whose effective permissions include this catalogue key. */
  permission: z.string().trim().max(80).optional(),
  /** When true, only users linked from a staff directory row (staff.institution_user_id). */
  provisionedFromStaff: z.coerce.boolean().optional(),
});
export type PortalUsersListQuery = z.infer<typeof portalUsersListQuerySchema>;

/** Invite (create) an institution user. Roles/campus access can be set now or via the access PUT. */
export const invitePortalUserSchema = z.object({
  email: emailSchema,
  fullName,
  phone,
  roleKeys: roleKeys.default([]),
  campusIds: campusIds.default([]),
  requireMfa: z.boolean().default(false),
});
export type InvitePortalUserInput = z.infer<typeof invitePortalUserSchema>;

/** Edit profile + lifecycle of an institution user (not roles/access — that's the access PUT). */
export const updatePortalUserSchema = z.object({
  fullName: fullName.optional(),
  phone,
  status: portalUserStatusSchema.optional(),
  requireMfa: z.boolean().optional(),
  version: versionSchema,
});
export type UpdatePortalUserInput = z.infer<typeof updatePortalUserSchema>;

/**
 * Replace a user's role assignment, campus access and permission overrides in one version-guarded
 * call (the access drawer). Each list fully replaces the current set. The service validates role
 * keys (default ∪ custom), campus ids (must belong to the institution) and override keys (catalogue).
 */
export const setPortalUserAccessSchema = z.object({
  roleKeys,
  campusIds: campusIds.default([]),
  directGrants: grantKeys.default([]),
  directDenies: grantKeys.default([]),
  version: versionSchema,
});
export type SetPortalUserAccessInput = z.infer<typeof setPortalUserAccessSchema>;
