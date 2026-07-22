import { z } from 'zod';
import { examQuestionTypeSchema } from './exam-questions';

const baseAnswer = {
  questionId: z.string().uuid(),
  flagged: z.boolean().optional(),
  /** Client wall-clock ISO; server keeps latest by this timestamp. */
  clientUpdatedAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
};

export const mcqSingleAnswerSchema = z.object({
  ...baseAnswer,
  type: z.literal('mcq_single'),
  choiceKey: z.string().trim().min(1).max(8).nullable(),
});

export const mcqMultiAnswerSchema = z.object({
  ...baseAnswer,
  type: z.literal('mcq_multi'),
  choiceKeys: z.array(z.string().trim().min(1).max(8)).nullable(),
});

export const assertionReasonAnswerSchema = z.object({
  ...baseAnswer,
  type: z.literal('assertion_reason'),
  choiceKey: z.enum(['a', 'b', 'c', 'd']).nullable(),
});

export const fillBlankAnswerSchema = z.object({
  ...baseAnswer,
  type: z.literal('fill_blank'),
  text: z.string().max(500).nullable(),
});

export const matchFollowingAnswerSchema = z.object({
  ...baseAnswer,
  type: z.literal('match_following'),
  /** left key → right key */
  pairs: z.record(z.string(), z.string()).nullable(),
});

export const numericalAnswerSchema = z.object({
  ...baseAnswer,
  type: z.literal('numerical'),
  value: z.number().nullable(),
  unit: z.string().max(32).nullable().optional(),
  /** Free-text working for step-mark AI grading. */
  workingText: z.string().max(10000).nullable().optional(),
});

export const shortAnswerAnswerSchema = z.object({
  ...baseAnswer,
  type: z.literal('short_answer'),
  text: z.string().max(5000).nullable(),
});

export const longAnswerAnswerSchema = z.object({
  ...baseAnswer,
  type: z.literal('long_answer'),
  text: z.string().max(20000).nullable(),
});

export const caseBasedSubAnswerSchema = z.object({
  subQuestionId: z.string().uuid(),
  payload: z.record(z.unknown()),
});

export const caseBasedAnswerSchema = z.object({
  ...baseAnswer,
  type: z.literal('case_based'),
  subAnswers: z.array(caseBasedSubAnswerSchema).nullable(),
});

export const examAnswerPayloadSchema = z.discriminatedUnion('type', [
  mcqSingleAnswerSchema,
  mcqMultiAnswerSchema,
  assertionReasonAnswerSchema,
  fillBlankAnswerSchema,
  matchFollowingAnswerSchema,
  numericalAnswerSchema,
  shortAnswerAnswerSchema,
  longAnswerAnswerSchema,
  caseBasedAnswerSchema,
]);
export type ExamAnswerPayload = z.infer<typeof examAnswerPayloadSchema>;

/** Wire body for PUT save-answer (type inferred from question if omitted). */
export const saveExamAnswerSchema = z.object({
  type: examQuestionTypeSchema.optional(),
  choiceKey: z.string().trim().max(8).nullish(),
  choiceKeys: z.array(z.string().trim().max(8)).nullish(),
  text: z.string().max(20000).nullish(),
  value: z.number().nullish(),
  unit: z.string().max(32).nullish(),
  workingText: z.string().max(10000).nullish(),
  pairs: z.record(z.string(), z.string()).nullish(),
  subAnswers: z.array(caseBasedSubAnswerSchema).nullish(),
  flagged: z.boolean().optional(),
  clientUpdatedAt: z.string().min(1),
  /** Legacy mock-exam photo attachment. */
  photoObjectId: z.string().uuid().nullish(),
  state: z.enum(['unseen', 'seen', 'answered', 'marked', 'marked_answered']).optional(),
  timeSpentMs: z.number().int().nonnegative().optional(),
  answerMode: z.enum(['type', 'photo', 'on_paper']).nullish(),
  photoRefs: z.array(z.string().uuid()).max(8).optional(),
  answerVersion: z.number().int().nonnegative().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});
export type SaveExamAnswerInput = z.infer<typeof saveExamAnswerSchema>;
