import { z } from 'zod';
import { labExamQuestionSchema } from './exam-questions';
import { examPatternObservationSchema, examQuestionEvaluationSchema } from './exam-grading';

/** SSE events while an exam is being generated. */
export const examGenerationSseEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start'),
    examId: z.string().uuid(),
    sectionCount: z.number().int().positive(),
    targetQuestionCount: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('stage'),
    stage: z.string(),
  }),
  z.object({
    type: z.literal('section'),
    sectionId: z.string(),
    sectionName: z.string(),
    index: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('question'),
    sectionId: z.string(),
    sequence: z.number().int().positive(),
    /** Stem only — never includes keys/answers on the wire during generation preview. */
    promptPreview: z.string().max(200),
    qtype: z.string(),
  }),
  z.object({
    type: z.literal('degraded'),
    message: z.string(),
    expectedCount: z.number().int(),
    actualCount: z.number().int(),
  }),
  z.object({
    type: z.literal('saved'),
    examId: z.string().uuid(),
    questionCount: z.number().int(),
    status: z.string(),
  }),
  z.object({
    type: z.literal('error'),
    message: z.string(),
    code: z.string().optional(),
  }),
]);
export type ExamGenerationSseEvent = z.infer<typeof examGenerationSseEventSchema>;

/** SSE events while subjective answers are being graded. */
export const examGradingSseEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('grading_started'),
    attemptId: z.string().uuid(),
    subjectiveCount: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('question_graded'),
    evaluation: examQuestionEvaluationSchema,
  }),
  z.object({
    type: z.literal('patterns'),
    observations: z.array(examPatternObservationSchema),
  }),
  z.object({
    type: z.literal('done'),
    attemptId: z.string().uuid(),
    awardedMarks: z.number(),
    maxMarks: z.number(),
  }),
  z.object({
    type: z.literal('error'),
    message: z.string(),
    code: z.string().optional(),
  }),
]);
export type ExamGradingSseEvent = z.infer<typeof examGradingSseEventSchema>;

/** AI batch generation output (validated then stored). */
export const examGenerationBatchOutputSchema = z.object({
  questions: z.array(labExamQuestionSchema).min(1).max(20),
});
export type ExamGenerationBatchOutput = z.infer<typeof examGenerationBatchOutputSchema>;
