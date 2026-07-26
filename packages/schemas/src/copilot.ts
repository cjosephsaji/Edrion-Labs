import { z } from 'zod';
import { cursorQuerySchema, reasonSchema, zEnumFromConst } from './common';
import { AiActionStatus } from '@edrion/shared-types';

export const aiActionStatusSchema = zEnumFromConst(AiActionStatus);

/** Context the Copilot plans + evaluates a run against. All fields optional. */
export const copilotContextSchema = z
  .object({
    institutionId: z.string().trim().max(120).optional(),
    campusId: z.string().trim().max(120).optional(),
    planId: z.string().trim().max(120).optional(),
    institutionUserId: z.string().trim().max(120).optional(),
    independentUserId: z.string().trim().max(120).optional(),
    featureKey: z.string().trim().max(120).optional(),
    paymentId: z.string().trim().max(120).optional(),
    amountMinor: z.number().int().optional(),
    employeeRoleKeys: z.array(z.string().trim().min(1)).optional(),
  })
  .default({});

/** Start a Copilot run — a prompt + optional target context. Prepares actions; executes nothing. */
export const createRunSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  context: copilotContextSchema,
});
export type CreateRunInput = z.infer<typeof createRunSchema>;

/**
 * Confirm a prepared run. The server re-evaluates guardrails before dispatch. `confirmationText`
 * is required by the API for high/critical-risk runs (typed confirmation); recent auth is enforced
 * by the guard. The reason flows into the audit event.
 */
export const confirmRunSchema = z.object({
  confirmationText: z.string().trim().max(200).optional(),
  reason: reasonSchema,
});
export type ConfirmRunInput = z.infer<typeof confirmRunSchema>;

export const rejectRunSchema = z.object({ reason: reasonSchema });
export type RejectRunInput = z.infer<typeof rejectRunSchema>;

/** Second-approver sign-off for a high-risk run (ai.approve_sensitive_action). */
export const approveRunSchema = z.object({
  approved: z.boolean().default(true),
  reason: reasonSchema,
});
export type ApproveRunInput = z.infer<typeof approveRunSchema>;

export const listRunsQuerySchema = cursorQuerySchema.extend({
  status: aiActionStatusSchema.optional(),
  employeeId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
  riskLevel: z.string().trim().max(20).optional(),
});
export type ListRunsQuery = z.infer<typeof listRunsQuerySchema>;
