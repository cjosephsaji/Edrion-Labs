import { z } from 'zod';
import { AccountStatus } from '@edrion/shared-types';
import { emailSchema, paginationQuerySchema, phoneSchema, reasonSchema, sortQuerySchema, zEnumFromConst } from './common';

/**
 * Institution-side RBAC model.
 *
 * These describe what an institution USER can do INSIDE their own institution — distinct from
 * the platform permission catalogue (@edrion/permissions) which governs Edrion employees. The
 * Super Admin platform manages these grants but never widens a user beyond a single institution
 * (see `campusAccessSchema` + the service invariant).
 *
 * Effective access = (union of role permissions ∪ directGrants) − directDenies, deny always
 * wins. The computation is pure and shared by the API (authoritative) and the client preview
 * so both agree before a change is committed (preview-before-confirm).
 */

/** Granular institution-side permission keys. */
export const INSTITUTION_PERMISSION_KEYS = [
  'inst.dashboard.view',
  'inst.students.view',
  'inst.students.manage',
  'inst.staff.view',
  'inst.staff.manage',
  'inst.classes.view',
  'inst.classes.manage',
  'inst.attendance.manage',
  'inst.grades.manage',
  'inst.timetable.manage',
  'inst.fees.view',
  'inst.fees.manage',
  'inst.reports.view',
  'inst.campus.manage',
  'inst.users.manage',
  'inst.settings.manage',
] as const;
export type InstitutionPermissionKey = (typeof INSTITUTION_PERMISSION_KEYS)[number];

export interface InstitutionRoleDef {
  key: string;
  name: string;
  description: string;
  permissions: InstitutionPermissionKey[];
}

const ALL: InstitutionPermissionKey[] = [...INSTITUTION_PERMISSION_KEYS];
const viewOnly = INSTITUTION_PERMISSION_KEYS.filter((k) => k.endsWith('.view')) as InstitutionPermissionKey[];

/** Default institution roles — bags of permission keys; nothing branches on a role name. */
export const INSTITUTION_ROLES: readonly InstitutionRoleDef[] = [
  {
    key: 'institution_admin',
    name: 'Institution Administrator',
    description: 'Full control across the institution and all its campuses.',
    permissions: ALL,
  },
  {
    key: 'campus_admin',
    name: 'Campus Administrator',
    description: 'Manages day-to-day operations within granted campuses.',
    permissions: [
      'inst.dashboard.view',
      'inst.students.view',
      'inst.students.manage',
      'inst.staff.view',
      'inst.staff.manage',
      'inst.classes.view',
      'inst.classes.manage',
      'inst.attendance.manage',
      'inst.grades.manage',
      'inst.timetable.manage',
      'inst.reports.view',
      'inst.campus.manage',
    ],
  },
  {
    key: 'teacher',
    name: 'Teacher',
    description: 'Runs classes — attendance, grades and timetable for assigned classes.',
    permissions: [
      'inst.dashboard.view',
      'inst.students.view',
      'inst.classes.view',
      'inst.classes.manage',
      'inst.attendance.manage',
      'inst.grades.manage',
      'inst.timetable.manage',
    ],
  },
  {
    key: 'finance_manager',
    name: 'Finance Manager',
    description: 'Owns fees and financial reporting.',
    permissions: ['inst.dashboard.view', 'inst.fees.view', 'inst.fees.manage', 'inst.reports.view'],
  },
  {
    key: 'front_desk',
    name: 'Front Desk',
    description: 'Handles enrolment and attendance at reception.',
    permissions: [
      'inst.dashboard.view',
      'inst.students.view',
      'inst.students.manage',
      'inst.attendance.manage',
    ],
  },
  {
    key: 'viewer',
    name: 'Viewer',
    description: 'Read-only visibility, no changes.',
    permissions: ['inst.dashboard.view', ...viewOnly],
  },
] as const;

export const INSTITUTION_ROLE_KEYS = INSTITUTION_ROLES.map((r) => r.key) as [string, ...string[]];

const ROLE_BY_KEY = new Map(INSTITUTION_ROLES.map((r) => [r.key, r]));

/** Campus access levels a grant may carry. */
export const CAMPUS_ACCESS_LEVELS = ['manage', 'view'] as const;
export type CampusAccessLevel = (typeof CAMPUS_ACCESS_LEVELS)[number];

export interface CampusGrant {
  campusId: string;
  accessLevel: CampusAccessLevel;
}

export interface EffectiveAccessInput {
  roleKeys: string[];
  directGrants?: string[];
  directDenies?: string[];
  campusAccess?: CampusGrant[];
}

export interface EffectiveAccess {
  roleKeys: string[];
  /** Final effective permission keys, sorted. Deny always wins over a grant. */
  permissionKeys: string[];
  /** Keys contributed purely by the assigned roles. */
  grantedByRole: string[];
  /** directGrants that add a key the roles did not already provide. */
  addedByOverride: string[];
  /** directDenies that actually removed a key the user would otherwise hold. */
  removedByOverride: string[];
  campusAccess: CampusGrant[];
  campusCount: number;
}

/**
 * Compute the effective access for an institution user. Pure — no IO. Used for the GET detail
 * "effective permissions" panel and the preview-before-confirm flow (where a proposed change is
 * merged in first, then this is recomputed).
 */
export function computeEffectiveAccess(input: EffectiveAccessInput): EffectiveAccess {
  const roleKeys = [...new Set(input.roleKeys)];
  const fromRoles = new Set<string>();
  for (const key of roleKeys) {
    const role = ROLE_BY_KEY.get(key);
    if (!role) continue;
    for (const p of role.permissions) fromRoles.add(p);
  }

  const grants = new Set(input.directGrants ?? []);
  const denies = new Set(input.directDenies ?? []);

  const effective = new Set(fromRoles);
  for (const g of grants) effective.add(g);
  for (const d of denies) effective.delete(d);

  const addedByOverride = [...grants].filter((g) => !fromRoles.has(g) && effective.has(g));
  const removedByOverride = [...denies].filter((d) => fromRoles.has(d) || grants.has(d));

  const campusAccess = input.campusAccess ?? [];
  return {
    roleKeys,
    permissionKeys: [...effective].sort(),
    grantedByRole: [...fromRoles].sort(),
    addedByOverride: addedByOverride.sort(),
    removedByOverride: removedByOverride.sort(),
    campusAccess,
    campusCount: campusAccess.length,
  };
}

// --- Zod request schemas ------------------------------------------------------

export const accountStatusSchema = zEnumFromConst(AccountStatus);
export const institutionRoleKeySchema = z.enum(INSTITUTION_ROLE_KEYS);
export const campusAccessLevelSchema = z.enum(CAMPUS_ACCESS_LEVELS);
export const institutionPermissionKeySchema = z.enum(INSTITUTION_PERMISSION_KEYS);

export const campusGrantSchema = z.object({
  campusId: z.string().uuid(),
  accessLevel: campusAccessLevelSchema.default('manage'),
});

/** Invitation flag for the directory: who has / hasn't accepted their invite. */
export const invitationFilterSchema = z.enum(['pending', 'accepted']);
/** Last-activity buckets for the directory. */
export const lastActivityFilterSchema = z.enum(['active_7d', 'active_30d', 'inactive_30d', 'never']);
/** Security posture buckets for the directory. */
export const securityFilterSchema = z.enum(['mfa_missing', 'mfa_required', 'locked', 'password_reset', 'disabled']);

export const listInstitutionUsersQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  institutionId: z.string().uuid().optional(),
  campusId: z.string().uuid().optional(),
  roleKey: institutionRoleKeySchema.optional(),
  status: accountStatusSchema.optional(),
  invitation: invitationFilterSchema.optional(),
  lastActivity: lastActivityFilterSchema.optional(),
  security: securityFilterSchema.optional(),
});
export type ListInstitutionUsersQuery = z.infer<typeof listInstitutionUsersQuerySchema>;

export const inviteInstitutionUserSchema = z.object({
  institutionId: z.string().uuid(),
  email: emailSchema,
  fullName: z.string().trim().min(2).max(160),
  phone: phoneSchema,
  roleKeys: z.array(institutionRoleKeySchema).min(1, 'Assign at least one role'),
  campusAccess: z.array(campusGrantSchema).default([]),
  /** Optional note included in the invitation email. */
  message: z.string().trim().max(500).optional(),
});
export type InviteInstitutionUserInput = z.infer<typeof inviteInstitutionUserSchema>;

export const resendInviteSchema = z.object({
  message: z.string().trim().max(500).optional(),
});
export type ResendInviteInput = z.infer<typeof resendInviteSchema>;

export const updateInstitutionUserSchema = z.object({
  fullName: z.string().trim().min(2).max(160).optional(),
  phone: phoneSchema,
  version: z.number().int().nonnegative(),
});
export type UpdateInstitutionUserInput = z.infer<typeof updateInstitutionUserSchema>;

export const changeRoleSchema = z.object({
  roleKeys: z.array(institutionRoleKeySchema).min(1, 'Assign at least one role'),
  reason: reasonSchema,
  version: z.number().int().nonnegative(),
});
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;

export const changeCampusAccessSchema = z.object({
  campusAccess: z.array(campusGrantSchema),
  reason: reasonSchema,
  version: z.number().int().nonnegative(),
});
export type ChangeCampusAccessInput = z.infer<typeof changeCampusAccessSchema>;

export const addPermissionOverrideSchema = z.object({
  key: institutionPermissionKeySchema,
  effect: z.enum(['grant', 'deny']),
  reason: reasonSchema,
  version: z.number().int().nonnegative(),
});
export type AddPermissionOverrideInput = z.infer<typeof addPermissionOverrideSchema>;

export const removePermissionOverrideSchema = z.object({
  key: institutionPermissionKeySchema,
  reason: reasonSchema,
  version: z.number().int().nonnegative(),
});
export type RemovePermissionOverrideInput = z.infer<typeof removePermissionOverrideSchema>;

/** A required reason + version, for the simple state-change actions. */
export const userStatusActionSchema = z.object({
  reason: reasonSchema,
  version: z.number().int().nonnegative(),
});
export type UserStatusActionInput = z.infer<typeof userStatusActionSchema>;

export const requireMfaSchema = z.object({
  required: z.boolean(),
  reason: reasonSchema,
  version: z.number().int().nonnegative(),
});
export type RequireMfaInput = z.infer<typeof requireMfaSchema>;

/** Security actions that don't depend on the row version (idempotent re-stamps). */
export const securityActionSchema = z.object({
  reason: reasonSchema,
});
export type SecurityActionInput = z.infer<typeof securityActionSchema>;

/**
 * A proposed access change to preview before committing. Any field left undefined keeps the
 * user's current value; the service merges these onto the live record, recomputes effective
 * access, and returns before/after so the UI can show the impact pre-confirmation.
 */
export const previewAccessChangeSchema = z
  .object({
    roleKeys: z.array(institutionRoleKeySchema).optional(),
    campusAccess: z.array(campusGrantSchema).optional(),
    addGrants: z.array(institutionPermissionKeySchema).optional(),
    addDenies: z.array(institutionPermissionKeySchema).optional(),
    removeOverrides: z.array(institutionPermissionKeySchema).optional(),
  })
  .default({});
export type PreviewAccessChangeInput = z.infer<typeof previewAccessChangeSchema>;

/**
 * Apply a proposed change onto a current access state, returning the inputs for a recomputed
 * effective-access. Pure — shared so the client can mirror the server's merge if it wants to.
 */
export function applyProposedChange(
  current: { roleKeys: string[]; directGrants: string[]; directDenies: string[]; campusAccess: CampusGrant[] },
  change: PreviewAccessChangeInput,
): EffectiveAccessInput {
  const grants = new Set(current.directGrants);
  const denies = new Set(current.directDenies);
  for (const g of change.addGrants ?? []) {
    grants.add(g);
    denies.delete(g);
  }
  for (const d of change.addDenies ?? []) {
    denies.add(d);
    grants.delete(d);
  }
  for (const k of change.removeOverrides ?? []) {
    grants.delete(k);
    denies.delete(k);
  }
  return {
    roleKeys: change.roleKeys ?? current.roleKeys,
    directGrants: [...grants],
    directDenies: [...denies],
    campusAccess: change.campusAccess ?? current.campusAccess,
  };
}
