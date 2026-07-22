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
