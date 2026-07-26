import { z } from 'zod';

export const AI_POLICIES = ['off', 'hints_only', 'full'] as const;
export const aiPolicySchema = z.enum(AI_POLICIES);

export const HOMEWORK_STATUSES = ['assigned', 'in_progress', 'submitted', 'graded', 'returned'] as const;
export const homeworkStatusSchema = z.enum(HOMEWORK_STATUSES);

export const homeworkListFilterSchema = z.enum(['all', 'progress', 'submitted', 'returned']);
export type HomeworkListFilter = z.infer<typeof homeworkListFilterSchema>;

export const statFromSchema = z.object({
  value: z.union([z.number(), z.string()]),
  unit: z.string().optional(),
  from: z.string().min(1),
});

export const homeworkBadgeSchema = z.object({
  label: z.string(),
  tone: z.enum(['neutral', 'info', 'success', 'warning', 'danger']),
});

export const homeworkListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  subjectLabel: z.string().nullable(),
  teacherName: z.string().nullable(),
  dueLabel: z.string(),
  badge: homeworkBadgeSchema,
  questionCount: z.number().int(),
  answeredCount: z.number().int(),
  status: homeworkStatusSchema,
  late: z.boolean(),
});

export const homeworkListSchema = z.object({
  items: z.array(homeworkListItemSchema),
});

export const homeworkAnswerModeSchema = z.enum(['type', 'photo', 'file']);

export const homeworkAnswerSchema = z.object({
  questionId: z.string().uuid(),
  mode: homeworkAnswerModeSchema,
  answerText: z.string().nullable(),
  answerObjectId: z.string().uuid().nullable(),
  updatedAt: z.string().nullable(),
  teacherMarks: z.number().int().nullable().optional(),
  teacherFeedback: z.string().nullable().optional(),
});

export const homeworkQuestionSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int(),
  promptText: z.string().nullable(),
  promptImageUrl: z.string().nullable(),
  maxMarks: z.number().int().nullable(),
});

export const homeworkDetailSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  instructions: z.string().nullable(),
  dueAt: z.string(),
  status: homeworkStatusSchema,
  aiPolicy: aiPolicySchema,
  questions: z.array(homeworkQuestionSchema),
  answers: z.array(homeworkAnswerSchema),
  totalMarks: z.number().int().nullable().optional(),
  totalMax: z.number().int().nullable().optional(),
  teacherNote: z.string().nullable().optional(),
  submittedAt: z.string().nullable().optional(),
  returnedAt: z.string().nullable().optional(),
});

export const upsertHomeworkAnswerSchema = z.object({
  mode: homeworkAnswerModeSchema,
  answerText: z.string().max(50000).nullish(),
  answerObjectId: z.string().uuid().nullish(),
});

export const homeworkAiPolicySchema = z.object({
  policy: aiPolicySchema,
  note: z.string(),
});

export type HomeworkListItemDto = z.infer<typeof homeworkListItemSchema>;
export type HomeworkDetailDto = z.infer<typeof homeworkDetailSchema>;
export type UpsertHomeworkAnswerInput = z.infer<typeof upsertHomeworkAnswerSchema>;
