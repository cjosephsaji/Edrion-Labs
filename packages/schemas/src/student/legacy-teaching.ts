/**
 * Legacy fixed-sequence teaching contracts — transitional until P1.4 deletes old routes.
 * Import from `@edrion/schemas/legacy-teaching`, not the main package entry.
 */
import { z } from 'zod';
import { svgSpecSchema } from './svg-spec';

export const conceptCardBlockSchema = z.object({
  title: z.string(),
  summary: z.string(),
  keyPoints: z.array(z.string()),
  goDeeper: z.array(z.object({ heading: z.string(), body: z.string() })).optional(),
  suggestedQuestions: z.array(z.string()).default([]),
});

export const visualExplainerBlockSchema = z.object({
  views: z.array(
    z.object({
      title: z.string(),
      svgSpec: svgSpecSchema,
    }),
  ),
  suggestedQuestions: z.array(z.string()).default([]),
});

export const workedExampleBlockSchema = z.object({
  equation: z.string().optional(),
  problem: z.string(),
  steps: z.array(
    z.object({
      label: z.string(),
      math: z.string().optional(),
      explanation: z.string(),
      why: z.string().optional(),
    }),
  ),
  suggestedQuestions: z.array(z.string()).default([]),
});

export const checkpointBlockSchema = z.object({
  question: z.string(),
  math: z.string().optional(),
  options: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        correct: z.boolean(),
        feedbackWrong: z.string().optional(),
      }),
    )
    .min(2)
    .max(4),
  explainPrompt: z.string(),
  suggestedQuestions: z.array(z.string()).default([]),
});

export const practiceItemBlockSchema = z.object({
  statement: z.string(),
  math: z.string().optional(),
  expectedForm: z.string().optional(),
  hints: z.array(z.string()).min(3).max(3),
  questionIndex: z.number().int().optional(),
  questionTotal: z.number().int().optional(),
  suggestedQuestions: z.array(z.string()).default([]),
});

export const reflectionSummaryBlockSchema = z.object({
  takeaways: z.array(z.string()).min(1),
  suggestedQuestions: z.array(z.string()).default([]),
});

export const noteCardBlockSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

export const legacyBlockTypeSchema = z.enum([
  'concept_card',
  'visual_explainer',
  'worked_example',
  'checkpoint',
  'practice_item',
  'reflection_summary',
  'note_card',
]);
export type LegacyBlockType = z.infer<typeof legacyBlockTypeSchema>;

export const legacySpineStepSchema = z.enum([
  'understand',
  'see_it_visually',
  'worked_example',
  'check_understanding',
  'solve_yourself',
  'wrap_up',
]);

export const legacyBlockContentSchemas = {
  concept_card: conceptCardBlockSchema,
  visual_explainer: visualExplainerBlockSchema,
  worked_example: workedExampleBlockSchema,
  checkpoint: checkpointBlockSchema,
  practice_item: practiceItemBlockSchema,
  reflection_summary: reflectionSummaryBlockSchema,
  note_card: noteCardBlockSchema,
} as const;

export type CheckpointBlock = z.infer<typeof checkpointBlockSchema>;
export type PracticeItemBlock = z.infer<typeof practiceItemBlockSchema>;
export type LegacySpineStep = z.infer<typeof legacySpineStepSchema>;

export function parseLegacyBlockContent<T extends LegacyBlockType>(
  blockType: T,
  content: unknown,
): z.infer<(typeof legacyBlockContentSchemas)[T]> {
  return legacyBlockContentSchemas[blockType].parse(content);
}

export const legacySessionSourceSchema = z.enum([
  'path',
  'resume',
  'tutor_grounded',
  'prep_plan',
  'intent',
  'refresh',
]);

export const legacyCreateSessionInputSchema = z.object({
  topicKey: z.string().optional(),
  topicTitle: z.string().optional(),
  pathItemId: z.string().uuid().optional(),
  source: legacySessionSourceSchema,
  kind: z.enum(['standard', 'refresh10']).optional(),
  grounding: z.object({ knowledgeItemId: z.string().uuid() }).optional(),
});

export const legacySpineEntrySchema = z.object({
  step: legacySpineStepSchema,
  label: z.string(),
  status: z.enum(['done', 'current', 'up']),
  meta: z.string().optional(),
});

export const legacySessionBlockSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int(),
  blockType: legacyBlockTypeSchema,
  spineStep: legacySpineStepSchema,
  content: z.record(z.unknown()),
  state: z.record(z.unknown()),
  completedAt: z.string().datetime().nullable(),
});

export const legacyLearnSessionSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  topicKey: z.string(),
  topicTitle: z.string(),
  subjectLabel: z.string(),
  status: z.enum(['active', 'paused', 'completed', 'abandoned']),
  spine: z.array(legacySpineEntrySchema),
  blocks: z.array(legacySessionBlockSchema),
  readOnly: z.boolean(),
  pathItemId: z.string().uuid().nullable().optional(),
  evidence: z.array(z.string()).optional(),
  startedAt: z.string().datetime(),
  pausedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
});

export const legacyCheckpointAnswerSchema = z.object({
  choice: z.string().optional(),
  explanation: z.string().optional(),
});

export const legacyPracticeAnswerSchema = z.object({
  answer: z.string(),
  scratchpad: z.string().optional(),
  photoObjectId: z.string().uuid().optional(),
});

export const legacyReflectionAnswerSchema = z.object({});

export const legacyAnswerBlockInputSchema = z.union([
  legacyCheckpointAnswerSchema,
  legacyPracticeAnswerSchema,
  legacyReflectionAnswerSchema,
]);

export type LegacyPracticeAnswerInput = z.infer<typeof legacyPracticeAnswerSchema>;
export type LegacyCheckpointAnswerInput = z.infer<typeof legacyCheckpointAnswerSchema>;

export const practiceAnswerSchema = legacyPracticeAnswerSchema;
export const checkpointAnswerSchema = legacyCheckpointAnswerSchema;
export type PracticeAnswerInput = LegacyPracticeAnswerInput;
export type CheckpointAnswerInput = LegacyCheckpointAnswerInput;

export const legacyHintInputSchema = z.object({
  rung: z.union([z.literal(2), z.literal(3)]),
});

export const hintInputSchema = legacyHintInputSchema;

export const legacySessionPlanSchema = z.object({
  kind: z.enum(['standard', 'refresh10']).default('standard'),
  spineMeta: z.record(z.string()).optional(),
  blocks: z.array(
    z.object({
      blockType: legacyBlockTypeSchema,
      spineStep: legacySpineStepSchema,
      brief: z.string(),
    }),
  ),
});

export type LegacyCreateSessionInput = z.infer<typeof legacyCreateSessionInputSchema>;
export type LegacyLearnSessionDto = z.infer<typeof legacyLearnSessionSchema>;
export type LegacySessionBlockDto = z.infer<typeof legacySessionBlockSchema>;
export type LegacySessionPlan = z.infer<typeof legacySessionPlanSchema>;

// Back-compat aliases used by old teaching modules until P1.4 deletion.
export const blockTypeSchema = legacyBlockTypeSchema;
export const spineStepSchema = legacySpineStepSchema;
export const createSessionInputSchema = legacyCreateSessionInputSchema;
export const sessionBlockSchema = legacySessionBlockSchema;
export const learnSessionSchema = legacyLearnSessionSchema;
export const sessionPlanSchema = legacySessionPlanSchema;
export const parseBlockContent = parseLegacyBlockContent;
export type BlockType = LegacyBlockType;
export type SpineStep = LegacySpineStep;
export type CreateSessionInput = LegacyCreateSessionInput;
export type LearnSessionDto = LegacyLearnSessionDto;
export type SessionBlockDto = LegacySessionBlockDto;
export type SessionPlan = LegacySessionPlan;
