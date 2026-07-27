import { z } from 'zod';
import { blockV1Schema } from './blocks';
import { endReasonSchema, orchestratorStatusSchema } from './state';

export const sessionEventTypeSchema = z.enum([
  'session_created',
  'status_changed',
  'block_stream_start',
  'block_stream_chunk',
  'block_stream_end',
  'block_interaction',
  'answer_recorded',
  'policy_notice',
  'system_notice_emitted',
  'budget_extended',
  'session_closed',
  'error',
]);

export type SessionEventType = z.infer<typeof sessionEventTypeSchema>;

/**
 * Payload of the audit event written for EVERY state-machine transition (§5).
 * Written in the same transaction as the `orchestrator_status` UPDATE.
 */
export const sessionStatusChangedPayloadSchema = z.object({
  from: orchestratorStatusSchema.nullable(),
  to: orchestratorStatusSchema,
  reason: z.string().max(80),
  end_reason: endReasonSchema.optional(),
  elapsed_minutes: z.number().int().nonnegative().optional(),
});

export type SessionStatusChangedPayload = z.infer<typeof sessionStatusChangedPayloadSchema>;

export const learnSessionEventSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  seq: z.number().int().nonnegative(),
  eventType: sessionEventTypeSchema,
  payload: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime(),
});

export type LearnSessionEventDto = z.infer<typeof learnSessionEventSchema>;

export const sseBlockEventSchema = z.object({
  type: z.enum(['block', 'status', 'heartbeat', 'error']),
  seq: z.number().int().nonnegative(),
  block: z
    .object({
      id: z.string().uuid(),
      streamSeq: z.number().int().nonnegative(),
      moveType: z.string(),
      block: blockV1Schema,
      reasoning: z.string().nullable().optional(),
      degraded: z.boolean(),
      renderStatus: z.string(),
    })
    .optional(),
  status: z
    .object({
      orchestratorStatus: z.string(),
      checkpointsTotal: z.number().int(),
      checkpointsDone: z.number().int(),
    })
    .optional(),
  error: z.string().optional(),
});

export type SseBlockEvent = z.infer<typeof sseBlockEventSchema>;

export const learnAiCallPurposeSchema = z.enum([
  'plan',
  'render',
  'grade',
  'profile',
  'judge',
]);

export const learnAiCallOutcomeSchema = z.enum([
  'success',
  'retry',
  'degraded',
  'error',
  'discarded_speculative',
]);

export const learnAiCallLogSchema = z.object({
  id: z.string().uuid(),
  purpose: learnAiCallPurposeSchema,
  model: z.string(),
  promptVersion: z.string().nullable().optional(),
  sessionId: z.string().uuid().nullable().optional(),
  blockId: z.string().uuid().nullable().optional(),
  blockSeq: z.number().int().nullable().optional(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cached: z.boolean(),
  durationMs: z.number().int().nullable().optional(),
  firstTokenMs: z.number().int().nullable().optional(),
  retry: z.boolean(),
  speculative: z.boolean(),
  degraded: z.boolean(),
  outcome: learnAiCallOutcomeSchema.nullable().optional(),
  error: z.string().nullable().optional(),
  occurredAt: z.string().datetime(),
});

export type LearnAiCallLogDto = z.infer<typeof learnAiCallLogSchema>;
