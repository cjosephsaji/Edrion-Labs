import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/**
 * Institution-Portal ROLES editor (Phase 11) request/response contracts: custom roles authored over
 * the institution permission catalogue. The default roles ship as code (read-only system entries);
 * these create/edit the per-institution CUSTOM roles. Reads need `roles.view`; writes need the
 * sensitive `roles.manage`. The service validates every permission key against the institution
 * catalogue (a friendly 400 `INVALID_PERMISSION`) and the key's uniqueness (409 `ROLE_EXISTS`).
 *
 * `portal*`/`PortalRole*`-prefixed to avoid colliding with the platform RBAC schema in this package.
 */

const roleKey = z
  .string()
  .trim()
  .min(2, 'Required')
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, 'Use lower-case letters, numbers and underscores (start with a letter)');
const name = z.string().trim().min(2, 'Required').max(120);
const description = z.string().trim().max(500).nullish();
const permissions = z.array(z.string().trim().min(1).max(80)).max(200).default([]);

export const portalRolesListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
});
export type PortalRolesListQuery = z.infer<typeof portalRolesListQuerySchema>;

export const createPortalRoleSchema = z.object({
  key: roleKey,
  name,
  description,
  permissions,
});
export type CreatePortalRoleInput = z.infer<typeof createPortalRoleSchema>;

export const updatePortalRoleSchema = z.object({
  // key is immutable after creation (assigned users reference it); only the display + grants change.
  name: name.optional(),
  description,
  permissions: permissions.optional(),
  version: versionSchema,
});
export type UpdatePortalRoleInput = z.infer<typeof updatePortalRoleSchema>;

/** Replace just the permission bag of a custom role (the permissions drawer). */
export const setPortalRolePermissionsSchema = z.object({
  permissions: z.array(z.string().trim().min(1).max(80)).max(200),
  version: versionSchema,
});
export type SetPortalRolePermissionsInput = z.infer<typeof setPortalRolePermissionsSchema>;
