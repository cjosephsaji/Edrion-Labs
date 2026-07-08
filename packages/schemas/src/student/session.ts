import { z } from 'zod';
import { blockTypeSchema, spineStepSchema } from './blocks';

export const sessionSourceSchema = z.enum(['path', 'resume', 'tutor_grounded', 'prep_plan', 'intent', 'refresh']);

export const createSessionInputSchema = z.object({
  topicKey: z.string().optional(),
  topicTitle: z.string().optional(),
  pathItemId: z.string().uuid().optional(),
  source: sessionSourceSchema,
  kind: z.enum(['standard', 'refresh10']).optional(),
  grounding: z.object({ knowledgeItemId: z.string().uuid() }).optional(),
});

export const spineEntrySchema = z.object({
  step: spineStepSchema,
  label: z.string(),
  status: z.enum(['done', 'current', 'up']),
  meta: z.string().optional(),
});

export const sessionBlockSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int(),
  blockType: blockTypeSchema,
  spineStep: spineStepSchema,
  content: z.record(z.unknown()),
  state: z.record(z.unknown()),
  completedAt: z.string().datetime().nullable(),
});

export const learnSessionSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  topicKey: z.string(),
  topicTitle: z.string(),
  subjectLabel: z.string(),
  status: z.enum(['active', 'paused', 'completed', 'abandoned']),
  spine: z.array(spineEntrySchema),
  blocks: z.array(sessionBlockSchema),
  readOnly: z.boolean(),
  pathItemId: z.string().uuid().nullable().optional(),
  evidence: z.array(z.string()).optional(),
  startedAt: z.string().datetime(),
  pausedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
});

export const checkpointAnswerSchema = z.object({
  choice: z.string().optional(),
  explanation: z.string().optional(),
});

export const practiceAnswerSchema = z.object({
  answer: z.string(),
  scratchpad: z.string().optional(),
  photoObjectId: z.string().uuid().optional(),
});

export const reflectionAnswerSchema = z.object({});

export const answerBlockInputSchema = z.union([
  checkpointAnswerSchema,
  practiceAnswerSchema,
  reflectionAnswerSchema,
]);

export const hintInputSchema = z.object({
  rung: z.union([z.literal(2), z.literal(3)]),
});

export const sessionPlanSchema = z.object({
  kind: z.enum(['standard', 'refresh10']).default('standard'),
  spineMeta: z.record(z.string()).optional(),
  blocks: z.array(
    z.object({
      blockType: blockTypeSchema,
      spineStep: spineStepSchema,
      brief: z.string(),
    }),
  ),
});

export type CreateSessionInput = z.infer<typeof createSessionInputSchema>;
export type LearnSessionDto = z.infer<typeof learnSessionSchema>;
export type SessionBlockDto = z.infer<typeof sessionBlockSchema>;
export type SessionPlan = z.infer<typeof sessionPlanSchema>;
export type CheckpointAnswerInput = z.infer<typeof checkpointAnswerSchema>;
export type PracticeAnswerInput = z.infer<typeof practiceAnswerSchema>;
