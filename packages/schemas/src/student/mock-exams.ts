/**
 * Lab Mock Exams DTOs — evolved for the Blueprint-driven exam engine.
 * Legacy field names kept where History / badges still expect them.
 */
import { z } from 'zod';
import { examBlueprintSchema, examSourceKindSchema } from './exam-blueprint';
import { examQuestionTypeSchema } from './exam-questions';
import { examResultsSchema } from './exam-grading';
import { saveExamAnswerSchema } from './exam-answers';

export const mockExamContextSchema = z.object({
  level: z.string(),
  board: z.string(),
  mix: z.string(),
  difficulty: z.string(),
  durationMin: z.number().int().positive(),
  totalMarks: z.number().int().positive().optional(),
  hintsOff: z.literal(true).default(true),
});

/** @deprecated Prefer createExamBlueprintInputSchema + generate. Kept for transitional clients. */
export const createMockExamSchema = z.object({
  subjectLabel: z.string().min(1),
  topics: z.array(z.string().min(1)).min(1),
  context: mockExamContextSchema,
  referenceObjectId: z.string().uuid().optional(),
  examGoalId: z.string().uuid().optional(),
  title: z.string().min(1).max(200).optional(),
  blueprintId: z.string().uuid().optional(),
});

export const mockAnswerUpdateSchema = saveExamAnswerSchema;

export const mockResultsSchema = examResultsSchema;

export const mockExamQuestionSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int(),
  topic: z.string(),
  qtype: examQuestionTypeSchema.or(z.enum(['mcq', 'short', 'long'])),
  prompt: z.string(),
  options: z.array(z.object({ key: z.string(), label: z.string() })).nullable().optional(),
  marks: z.number().int(),
  sectionId: z.string().optional(),
  difficulty: z.string().optional(),
  /** Full typed payload when available (keys stripped for in-progress attempts). */
  payload: z.record(z.unknown()).optional(),
});

export const mockExamStatusSchema = z.enum([
  'draft',
  'generating',
  'ready',
  'in_progress',
  'completed',
  'failed',
]);

export const mockExamDtoSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  subjectLabel: z.string(),
  topics: z.array(z.string()),
  context: mockExamContextSchema,
  status: mockExamStatusSchema,
  blueprintId: z.string().uuid().nullable().optional(),
  blueprint: examBlueprintSchema.optional(),
  sourceKind: examSourceKindSchema.optional(),
  generationNotice: z.string().nullable().optional(),
  gradingStatus: z.enum(['pending', 'grading', 'graded']).nullable().optional(),
  questions: z.array(mockExamQuestionSchema).optional(),
  attempt: z
    .object({
      id: z.string().uuid(),
      attemptNo: z.number().int(),
      startedAt: z.string(),
      endsAt: z.string(),
      finishedAt: z.string().nullable(),
      status: z
        .enum(['in_progress', 'submitted', 'grading', 'graded', 'expired', 'abandoned', 'paused'])
        .optional(),
      pausedAt: z.string().nullable().optional(),
    })
    .optional(),
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        flagged: z.boolean(),
        payload: z.record(z.unknown()).nullable().optional(),
        choiceKey: z.string().nullable().optional(),
        answerText: z.string().nullable().optional(),
        evaluation: z.record(z.unknown()).nullable().optional(),
        clientUpdatedAt: z.string().nullable().optional(),
      }),
    )
    .optional(),
  results: mockResultsSchema.optional(),
});

export const mockGenerationOutputSchema = z.object({
  questions: z.array(
    z.object({
      topic: z.string(),
      qtype: z.enum(['mcq', 'short', 'long']),
      prompt: z.string(),
      options: z.array(z.object({ key: z.string(), label: z.string() })).optional(),
      correctKey: z.string().optional(),
      markingNote: z.string().optional(),
      marks: z.number().int().default(1),
    }),
  ),
});

export const generateExamInputSchema = z.object({
  blueprintId: z.string().uuid(),
});
export type GenerateExamInput = z.infer<typeof generateExamInputSchema>;

export const checkExamTopicInputSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  subjectLabel: z.string().trim().min(1).max(120).optional(),
});

export const pushRevisionTopicsInputSchema = z.object({
  attemptId: z.string().uuid(),
  topicLabels: z.array(z.string().min(1)).min(1).max(20),
  confirmed: z.literal(true),
});

export const examListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  subjectLabel: z.string(),
  status: mockExamStatusSchema,
  blueprintId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  awardedMarks: z.number().nullable().optional(),
  maxMarks: z.number().nullable().optional(),
});

export type CreateMockExamInput = z.infer<typeof createMockExamSchema>;
export type MockExamDto = z.infer<typeof mockExamDtoSchema>;
export type MockResultsDto = z.infer<typeof mockResultsSchema>;
export type ExamListItem = z.infer<typeof examListItemSchema>;
