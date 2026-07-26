import { z } from 'zod';
import {
  FeatureDefinitionStatus,
  FeatureReleaseStage,
  FeatureRolloutType,
  FeatureScope,
} from '@edrion/shared-types';
import {
  paginationQuerySchema,
  reasonSchema,
  sortQuerySchema,
  uuidSchema,
  versionSchema,
  zEnumFromConst,
} from './common';

export const featureScopeSchema = zEnumFromConst(FeatureScope);
export const featureReleaseStageSchema = zEnumFromConst(FeatureReleaseStage);
export const featureDefinitionStatusSchema = zEnumFromConst(FeatureDefinitionStatus);
export const featureRolloutTypeSchema = zEnumFromConst(FeatureRolloutType);

/** Feature key — stable machine identifier, lower_snake_case. */
const featureKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, 'Lowercase letters, numbers and underscores; must start with a letter');

// --- Definitions --------------------------------------------------------------------------

export const createFeatureDefinitionSchema = z.object({
  key: featureKeySchema,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  module: z.string().trim().min(2).max(64),
  defaultValue: z.boolean().default(false),
  availableScopes: z.array(featureScopeSchema).default([]),
  dependencies: z.array(featureKeySchema).default([]),
  releaseStage: featureReleaseStageSchema.default(FeatureReleaseStage.Internal),
  owner: z.string().trim().max(120).optional(),
});
export type CreateFeatureDefinitionInput = z.infer<typeof createFeatureDefinitionSchema>;

export const updateFeatureDefinitionSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  module: z.string().trim().min(2).max(64).optional(),
  defaultValue: z.boolean().optional(),
  availableScopes: z.array(featureScopeSchema).optional(),
  dependencies: z.array(featureKeySchema).optional(),
  releaseStage: featureReleaseStageSchema.optional(),
  owner: z.string().trim().max(120).nullable().optional(),
  version: versionSchema,
});
export type UpdateFeatureDefinitionInput = z.infer<typeof updateFeatureDefinitionSchema>;

/** Change a definition's lifecycle status (active/inactive/archived). Sensitive — needs a reason. */
export const setFeatureStatusSchema = z.object({
  status: featureDefinitionStatusSchema,
  version: versionSchema,
  reason: reasonSchema,
});
export type SetFeatureStatusInput = z.infer<typeof setFeatureStatusSchema>;

// --- Assignments --------------------------------------------------------------------------

export const upsertFeatureAssignmentSchema = z
  .object({
    scope: featureScopeSchema,
    /** Required for every scope except global. Plan/inst/campus/user id or employee-role key. */
    scopeId: z.string().trim().min(1).max(120).nullable().optional(),
    value: z.boolean(),
    enabled: z.boolean().default(true),
    activatesAt: z.string().datetime().nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    reason: reasonSchema,
  })
  .refine((v) => v.scope === FeatureScope.Global || !!v.scopeId, {
    message: 'scopeId is required for non-global scopes',
    path: ['scopeId'],
  });
export type UpsertFeatureAssignmentInput = z.infer<typeof upsertFeatureAssignmentSchema>;

export const removeFeatureAssignmentSchema = z.object({ reason: reasonSchema });
export type RemoveFeatureAssignmentInput = z.infer<typeof removeFeatureAssignmentSchema>;

// --- Rollouts -----------------------------------------------------------------------------

export const upsertFeatureRolloutSchema = z
  .object({
    type: featureRolloutTypeSchema,
    enabled: z.boolean().default(true),
    percentage: z.number().int().min(0).max(100).nullable().optional(),
    allowList: z.array(z.string().trim().min(1)).default([]),
    blockList: z.array(z.string().trim().min(1)).default([]),
    environments: z.array(z.string().trim().min(1)).default([]),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    reason: reasonSchema,
  })
  .refine(
    (v) => v.type !== FeatureRolloutType.Percentage || (v.percentage != null && v.percentage >= 0),
    { message: 'percentage is required for a percentage rollout', path: ['percentage'] },
  );
export type UpsertFeatureRolloutInput = z.infer<typeof upsertFeatureRolloutSchema>;

/** Toggle the emergency kill switch. Sensitive — requires recent auth at the API. */
export const setKillSwitchSchema = z.object({
  enabled: z.boolean(),
  reason: reasonSchema,
});
export type SetKillSwitchInput = z.infer<typeof setKillSwitchSchema>;

export const removeFeatureRolloutSchema = z.object({ reason: reasonSchema });
export type RemoveFeatureRolloutInput = z.infer<typeof removeFeatureRolloutSchema>;

// --- Effective-value preview --------------------------------------------------------------

/** Resolve the effective value for a feature against an explicit context (the UI explainer). */
export const resolveFeatureQuerySchema = z.object({
  planId: uuidSchema.optional(),
  institutionId: uuidSchema.optional(),
  campusId: uuidSchema.optional(),
  institutionUserId: uuidSchema.optional(),
  independentUserId: uuidSchema.optional(),
  employeeRoleKeys: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v == null ? undefined : Array.isArray(v) ? v : v.split(',').map((s) => s.trim()).filter(Boolean))),
  environment: z.string().trim().max(40).optional(),
  subjectId: z.string().trim().max(120).optional(),
  at: z.string().datetime().optional(),
});
export type ResolveFeatureQuery = z.infer<typeof resolveFeatureQuerySchema>;

// --- List ---------------------------------------------------------------------------------

export const listFeaturesQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(120).optional(),
  module: z.string().trim().max(64).optional(),
  status: featureDefinitionStatusSchema.optional(),
  releaseStage: featureReleaseStageSchema.optional(),
});
export type ListFeaturesQuery = z.infer<typeof listFeaturesQuerySchema>;
