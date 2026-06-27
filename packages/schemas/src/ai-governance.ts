import { z } from 'zod';
import {
  AiActionRuleEffect,
  AiCapability,
  AiMode,
  FeatureScope,
  RiskLevel,
} from '@edrion/shared-types';
import { paginationQuerySchema, reasonSchema, versionSchema, zEnumFromConst } from './common';

export const aiModeSchema = zEnumFromConst(AiMode);
export const aiCapabilitySchema = zEnumFromConst(AiCapability);
export const aiActionRuleEffectSchema = zEnumFromConst(AiActionRuleEffect);
export const aiPolicyScopeSchema = zEnumFromConst(FeatureScope);
const aiRiskLevelSchema = zEnumFromConst(RiskLevel);

/** Per-capability enable map. Absent keys default to enabled at resolution. */
export const capabilityMapSchema = z.record(aiCapabilitySchema, z.boolean());

const capInt = z.number().int().nonnegative();

// --- Policies -----------------------------------------------------------------------------

/**
 * Upsert an AI governance policy at a scope. `scopeId` is required for every scope except global.
 * The scope-specific configure permission is enforced at the API; sensitive → recent auth.
 */
export const upsertAiPolicySchema = z
  .object({
    scope: aiPolicyScopeSchema,
    scopeId: z.string().trim().min(1).max(120).nullable().optional(),
    enabled: z.boolean().default(true),
    mode: aiModeSchema,
    capabilities: capabilityMapSchema.optional(),
    maxFinancialImpactMinor: capInt.nullable().optional(),
    maxAffectedUsers: capInt.nullable().optional(),
    twoPersonThresholdMinor: capInt.nullable().optional(),
    secondApproverCapabilities: z.array(aiCapabilitySchema).default([]),
    reason: reasonSchema,
    /** Optional optimistic-concurrency token; required on update of an existing scope policy. */
    version: versionSchema.optional(),
  })
  .refine((v) => v.scope === FeatureScope.Global || !!v.scopeId, {
    message: 'scopeId is required for non-global scopes',
    path: ['scopeId'],
  });
export type UpsertAiPolicyInput = z.infer<typeof upsertAiPolicySchema>;

export const removeAiPolicySchema = z.object({ reason: reasonSchema });
export type RemoveAiPolicyInput = z.infer<typeof removeAiPolicySchema>;

/** Toggle the emergency AI kill switch for a scope policy. Sensitive — ai.disable + recent auth. */
export const setAiKillSwitchSchema = z.object({
  scope: aiPolicyScopeSchema,
  scopeId: z.string().trim().min(1).max(120).nullable().optional(),
  enabled: z.boolean(),
  reason: reasonSchema,
});
export type SetAiKillSwitchInput = z.infer<typeof setAiKillSwitchSchema>;

export const listAiPoliciesQuerySchema = paginationQuerySchema.extend({
  scope: aiPolicyScopeSchema.optional(),
  mode: aiModeSchema.optional(),
});
export type ListAiPoliciesQuery = z.infer<typeof listAiPoliciesQuerySchema>;

// --- Action rules -------------------------------------------------------------------------

export const upsertAiActionRuleSchema = z.object({
  capability: aiCapabilitySchema,
  action: z.string().trim().min(2).max(120).nullable().optional(),
  enabled: z.boolean().default(true),
  effect: aiActionRuleEffectSchema,
  riskLevel: aiRiskLevelSchema.nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  reason: reasonSchema,
  version: versionSchema.optional(),
});
export type UpsertAiActionRuleInput = z.infer<typeof upsertAiActionRuleSchema>;

export const removeAiActionRuleSchema = z.object({ reason: reasonSchema });
export type RemoveAiActionRuleInput = z.infer<typeof removeAiActionRuleSchema>;

// --- Guardrail evaluation preview ----------------------------------------------------------

/** A proposed action to run through the guardrail evaluator (the Control-Centre explainer + 8b). */
export const proposedActionSchema = z.object({
  capability: aiCapabilitySchema,
  action: z.string().trim().min(2).max(120),
  requiredPermission: z.string().trim().max(120).optional(),
  financialImpactMinor: z.number().int().optional(),
  affectedUsers: capInt.optional(),
  riskLevel: aiRiskLevelSchema.optional(),
  reversible: z.boolean().optional(),
});
export type ProposedActionInput = z.infer<typeof proposedActionSchema>;

/** Resolve the effective AI policy for a context (the Control-Centre explainer). */
export const effectivePolicyQuerySchema = z.object({
  planId: z.string().trim().max(120).optional(),
  institutionId: z.string().trim().max(120).optional(),
  campusId: z.string().trim().max(120).optional(),
  institutionUserId: z.string().trim().max(120).optional(),
  independentUserId: z.string().trim().max(120).optional(),
  employeeRoleKeys: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) =>
      v == null ? undefined : Array.isArray(v) ? v : v.split(',').map((s) => s.trim()).filter(Boolean),
    ),
});
export type EffectivePolicyQuery = z.infer<typeof effectivePolicyQuerySchema>;

/** Run the guardrail evaluator against a proposed action + target context. Read-only preview. */
export const evaluateGuardrailSchema = z.object({
  proposed: proposedActionSchema,
  context: z
    .object({
      planId: z.string().trim().max(120).optional(),
      institutionId: z.string().trim().max(120).optional(),
      campusId: z.string().trim().max(120).optional(),
      institutionUserId: z.string().trim().max(120).optional(),
      independentUserId: z.string().trim().max(120).optional(),
      employeeRoleKeys: z.array(z.string().trim().min(1)).optional(),
    })
    .default({}),
});
export type EvaluateGuardrailRequest = z.infer<typeof evaluateGuardrailSchema>;
