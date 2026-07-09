import { z } from 'zod';
import { versionSchema } from './common';

/** Question types supported across exams and quiz-mode assignments. */
export const QUESTION_TYPES = [
  'mcq_single',
  'mcq_multi',
  'true_false',
  'short_answer',
  'long_answer',
  'fill_blank',
  'numeric',
  'matching',
] as const;
export const questionTypeSchema = z.enum(QUESTION_TYPES);
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Auto-gradable question types (deterministic scoring). */
export const AUTO_GRADABLE_TYPES = new Set<string>([
  'mcq_single',
  'mcq_multi',
  'true_false',
  'numeric',
  'fill_blank',
]);

export const questionOptionSchema = z.object({
  key: z.string().trim().min(1).max(8),
  label: z.string().trim().min(1).max(500),
  imageObjectId: z.string().uuid().optional(),
});

export const questionInputSchema = z.object({
  qtype: questionTypeSchema,
  prompt: z.string().trim().min(1).max(5000),
  promptImageObjectId: z.string().uuid().nullish(),
  options: z.array(questionOptionSchema).max(20).optional(),
  correctKey: z.string().trim().max(64).nullish(),
  markingNote: z.string().trim().max(2000).nullish(),
  marks: z.coerce.number().int().min(0).max(1000).default(1),
  sequence: z.coerce.number().int().min(1).max(500),
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

export const createQuestionSchema = questionInputSchema;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

export const updateQuestionSchema = questionInputSchema.partial().extend({ version: versionSchema });
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

/** Student answer update during an attempt. */
export const attemptAnswerUpdateSchema = z.object({
  choiceKey: z.string().trim().max(64).nullish(),
  answerText: z.string().trim().max(10000).nullish(),
  answerObjectId: z.string().uuid().nullish(),
});
export type AttemptAnswerUpdateInput = z.infer<typeof attemptAnswerUpdateSchema>;

/** Teacher grading override for a single answer. */
export const gradeAnswerSchema = z.object({
  teacherMarks: z.coerce.number().int().min(0).max(1000).nullish(),
  teacherFeedback: z.string().trim().max(2000).nullish(),
});
export type GradeAnswerInput = z.infer<typeof gradeAnswerSchema>;
