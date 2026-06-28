import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/**
 * Institution-Portal SETTINGS tree (Phase 11) request/response contracts: a flat, campus-scoped
 * key/value store grouped by `category`. Tenancy (institution_id) + the active campus scope
 * (campus_id) are NEVER taken from the body. Reads need `institution_settings.view`; writes need
 * the sensitive `institution_settings.manage` (campus writes also accept `campus_settings.manage`).
 *
 * `portal*`/`PortalSetting*`-prefixed to avoid colliding with the platform `institution-users.ts`
 * RBAC schema that already lives in this package.
 */

export const SETTING_CATEGORIES = [
  'general',
  'academic',
  'branding',
  'localization',
  'notifications',
  'security',
] as const;
export const settingCategorySchema = z.enum(SETTING_CATEGORIES);
export type SettingCategory = (typeof SETTING_CATEGORIES)[number];

export const SETTING_VALUE_TYPES = ['string', 'number', 'boolean', 'json'] as const;
export const settingValueTypeSchema = z.enum(SETTING_VALUE_TYPES);
export type SettingValueType = (typeof SETTING_VALUE_TYPES)[number];

const key = z
  .string()
  .trim()
  .min(1, 'Required')
  .max(120)
  .regex(/^[a-z0-9][a-z0-9_.-]*$/, 'Use lower-case letters, numbers, dot, dash or underscore');
const label = z.string().trim().min(1, 'Required').max(160);
const value = z.string().trim().max(8000).nullish();
const description = z.string().trim().max(500).nullish();

export const portalSettingsListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  category: settingCategorySchema.optional(),
});
export type PortalSettingsListQuery = z.infer<typeof portalSettingsListQuerySchema>;

export const createPortalSettingSchema = z.object({
  category: settingCategorySchema,
  key,
  label,
  valueType: settingValueTypeSchema.default('string'),
  value,
  description,
});
export type CreatePortalSettingInput = z.infer<typeof createPortalSettingSchema>;

export const updatePortalSettingSchema = z.object({
  category: settingCategorySchema.optional(),
  key: key.optional(),
  label: label.optional(),
  valueType: settingValueTypeSchema.optional(),
  value,
  description,
  version: versionSchema,
});
export type UpdatePortalSettingInput = z.infer<typeof updatePortalSettingSchema>;
