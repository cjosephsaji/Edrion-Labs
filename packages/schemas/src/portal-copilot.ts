import { z } from 'zod';
import { AiActionStatus } from '@edrion/shared-types';
import { paginationQuerySchema, reasonSchema, zEnumFromConst } from './common';

/**
 * INSTITUTION-PORTAL Copilot zod (Phase 10). The tenant-facing counterpart of the platform copilot
 * schemas (copilot.ts). A run is a prompt + optional target context the assistant plans + evaluates
 * against. Mutations always require a human confirmation before the server dispatches them via the
 * real audited portal service. Names are `portal*`-prefixed to avoid colliding with the platform set.
 */

export const portalAiActionStatusSchema = zEnumFromConst(AiActionStatus);

/** Context the portal Copilot plans + evaluates a run against. All fields optional. */
export const portalCopilotContextSchema = z
  .object({
    campusId: z.string().trim().max(120).optional(),
    /** A target student for a search/lookup tool. */
    studentId: z.string().trim().max(120).optional(),
    /** A target announcement (for publish). */
    announcementId: z.string().trim().max(120).optional(),
    /** A title for a drafted announcement. */
    title: z.string().trim().max(200).optional(),
    /** Free-text search term for a lookup tool. */
    query: z.string().trim().max(200).optional(),
  })
  .default({});
export type PortalCopilotContext = z.infer<typeof portalCopilotContextSchema>;

/** Start a portal Copilot run — a prompt + optional target context. Prepares actions; executes nothing. */
export const portalCreateRunSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  context: portalCopilotContextSchema,
});
export type PortalCreateRunInput = z.infer<typeof portalCreateRunSchema>;

/**
 * Confirm a prepared run. The server re-evaluates guardrails before dispatch. `confirmationText` is
 * required by the API for high/critical-risk runs (typed confirmation). The reason flows into the audit
 * event.
 */
export const portalConfirmRunSchema = z.object({
  confirmationText: z.string().trim().max(200).optional(),
  reason: reasonSchema,
});
export type PortalConfirmRunInput = z.infer<typeof portalConfirmRunSchema>;

export const portalRejectRunSchema = z.object({ reason: reasonSchema });
export type PortalRejectRunInput = z.infer<typeof portalRejectRunSchema>;

export const portalRunsListQuerySchema = paginationQuerySchema.extend({
  status: portalAiActionStatusSchema.optional(),
  search: z.string().trim().max(200).optional(),
});
export type PortalRunsListQuery = z.infer<typeof portalRunsListQuerySchema>;
