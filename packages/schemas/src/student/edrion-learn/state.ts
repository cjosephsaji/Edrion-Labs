import { z } from 'zod';
import { learnPolicyV1Schema } from './policy';
import { moveTypeSchema } from './plan';
import { selfDeclaredGoalV1Schema } from './goal';

export const sessionGoalSchema = z.enum(['acquisition', 'revision', 'remediation']);
export const emotionalContextSchema = z.enum(['neutral', 'setback', 'curious', 'anxious']);

export const moveOutcomeSchema = z.object({
  answered: z
    .object({
      correct: z.number().int().nonnegative().optional(),
      wrong: z.number().int().nonnegative().optional(),
      null: z.number().int().nonnegative().optional(),
    })
    .optional(),
  probe_escaped: z.boolean().optional(),
  expanded_deeper: z.boolean().optional(),
  skipped: z.boolean().optional(),
  prediction_text: z.string().max(500).optional(),
  free_question: z.string().max(500).optional(),
});

export const sessionMoveDigestSchema = z.object({
  seq: z.number().int().nonnegative(),
  move_type: moveTypeSchema,
  checkpoint_advance: z.boolean(),
  outcome: moveOutcomeSchema,
});

export const sessionStateV1Schema = z.object({
  v: z.literal(1),
  session_id: z.string().uuid(),
  topic_key: z.string().min(1),
  goal: sessionGoalSchema,
  emotional_context: emotionalContextSchema.default('neutral'),
  time_budget_minutes: z.number().int().min(5).max(120),
  elapsed_minutes: z.number().int().nonnegative().default(0),
  checkpoints: z.object({
    total: z.number().int().nonnegative(),
    done: z.number().int().nonnegative(),
  }),
  moves: z.array(sessionMoveDigestSchema).max(20),
  probe_chains: z.object({
    open_chain_id: z.string().uuid().nullable().optional(),
    turn: z.union([z.literal(1), z.literal(2)]).nullable().optional(),
    chains_used: z.number().int().nonnegative().default(0),
  }),
  mastery_snapshot: z.record(z.number().min(0).max(1)).default({}),
  pending_free_question: z.string().max(500).nullable().optional(),
  free_questions_used: z.number().int().nonnegative().default(0),
  /**
   * Wall-clock accounting (§5). `paused_ms_total` is the sum of every COMPLETED
   * pause interval; the currently-open interval (if any) is derived from
   * `learn_sessions.paused_at`. Together with `started_at` this makes
   * `elapsed_minutes` computable on every request without a new column.
   */
  paused_ms_total: z.number().int().nonnegative().default(0),
  /** `elapsed >= budget - 3min`: the planner should steer toward closing. */
  wrap_up: z.boolean().default(false),
  /** "+5 minutes" is allowed EXACTLY ONCE per session (§5). */
  budget_extended: z.boolean().default(false),
  /** The fatigue break card (§3) is emitted at most once per session. */
  fatigue_notice_sent: z.boolean().default(false),
  /** The budget/wrap-up notice is emitted at most once per session. */
  budget_notice_sent: z.boolean().default(false),
  /** Rolling window of the last 3 GRADED answers — the fatigue rule's input. */
  recent_graded: z.array(z.enum(['correct', 'wrong'])).max(3).default([]),
});

export type SessionStateV1 = z.infer<typeof sessionStateV1Schema>;
export type SessionGoal = z.infer<typeof sessionGoalSchema>;
export type EmotionalContext = z.infer<typeof emotionalContextSchema>;

export const sessionContextV1Schema = z.object({
  v: z.literal(1),
  time_budget_minutes: z.number().int().min(5).max(120).optional(),
  goal: selfDeclaredGoalV1Schema.optional(),
  emotional_context: emotionalContextSchema.optional(),
  policy_snapshot: learnPolicyV1Schema,
  grounding_knowledge_item_id: z.string().uuid().optional(),
  active_assignment_overlap: z.boolean().optional(),
  source_report_card_entry_id: z.string().uuid().optional(),
  source_exam_schedule_id: z.string().uuid().optional(),
  days_until_exam: z.number().int().nonnegative().optional(),
  subject_label: z.string().max(200).optional(),
});

export type SessionContextV1 = z.infer<typeof sessionContextV1Schema>;

export const entryPointSchema = z.enum([
  'learning_path',
  'free_chat_handoff',
  'library_document',
  'review_queue',
  'goal',
  'prep_countdown',
  'bad_result',
  'upcoming_exam',
]);

export type EntryPoint = z.infer<typeof entryPointSchema>;

export const orchestratorStatusSchema = z.enum([
  'created',
  'active',
  'awaiting_response',
  'paused',
  'closing',
  'closed',
]);

export type OrchestratorStatus = z.infer<typeof orchestratorStatusSchema>;

/** Terminal state: nothing may leave it. */
export const ORCHESTRATOR_TERMINAL_STATUSES = ['closed'] as const;

/**
 * Hyperspec §5, binding:
 *   created → active ⇄ awaiting_response → active → closing → closed
 *   active|awaiting_response → paused → active
 *   any non-terminal → closed   (student_exit / policy_kill / abandoned)
 *   paused --24h--> closed(abandoned)
 *
 * NOTE: `learn_sessions.orchestrator_status` is still a free `text` column with
 * no DB CHECK. Until that migration lands this table plus `orchestratorStatusSchema`
 * are the ONLY enforcement of the closed set.
 */
export const ORCHESTRATOR_TRANSITIONS: Record<OrchestratorStatus, readonly OrchestratorStatus[]> = {
  created: ['active', 'closed'],
  active: ['awaiting_response', 'paused', 'closing', 'closed'],
  awaiting_response: ['active', 'paused', 'closing', 'closed'],
  paused: ['active', 'closed'],
  closing: ['closed'],
  closed: [],
};

export function isValidOrchestratorTransition(
  from: OrchestratorStatus,
  to: OrchestratorStatus,
): boolean {
  return (ORCHESTRATOR_TRANSITIONS[from] ?? []).includes(to);
}

export const endReasonSchema = z.enum([
  'goal_met',
  'time_budget',
  'move_cap',
  'student_exit',
  'abandoned',
  'policy_kill',
]);

export type EndReason = z.infer<typeof endReasonSchema>;

export const entryRefSchema = z.union([
  z.object({
    learning_path_id: z.string().uuid(),
    learning_path_item_id: z.string().uuid(),
  }),
  z.object({ material_id: z.string().uuid() }),
  z.object({ commitment_id: z.string().uuid() }),
  z.object({ knowledge_item_id: z.string().uuid() }),
  z.object({ report_card_entry_id: z.string().uuid() }),
  z.object({ exam_schedule_id: z.string().uuid() }),
]);

export type EntryRef = z.infer<typeof entryRefSchema>;
