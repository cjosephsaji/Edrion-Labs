import { z } from 'zod';

export const mockExamContextSchema = z.object({
  level: z.string(),
  board: z.string(),
  mix: z.string(),
  difficulty: z.string(),
  durationMin: z.number().int().positive(),
  totalMarks: z.number().int().positive().optional(),
  hintsOff: z.literal(true).default(true),
});

export const createMockExamSchema = z.object({
  subjectLabel: z.string().min(1),
  topics: z.array(z.string().min(1)).min(1),
  context: mockExamContextSchema,
  referenceObjectId: z.string().uuid().optional(),
  examGoalId: z.string().uuid().optional(),
  title: z.string().min(1).max(200).optional(),
});

export const mockAnswerUpdateSchema = z.object({
  choiceKey: z.string().optional(),
  answerText: z.string().optional(),
  photoObjectId: z.string().uuid().optional(),
  flagged: z.boolean().optional(),
});

export const mockResultsSchema = z.object({
  total: z.number().int(),
  correct: z.number().int(),
  byTopic: z.array(
    z.object({
      topic: z.string(),
      total: z.number().int(),
      correct: z.number().int(),
      note: z.string().optional(),
    }),
  ),
  suggestion: z.string(),
});

export const mockExamQuestionSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int(),
  topic: z.string(),
  qtype: z.enum(['mcq', 'short', 'long']),
  prompt: z.string(),
  options: z.array(z.object({ key: z.string(), label: z.string() })).nullable(),
  marks: z.number().int(),
});

export const mockExamDtoSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  subjectLabel: z.string(),
  topics: z.array(z.string()),
  context: mockExamContextSchema,
  status: z.enum(['draft', 'generating', 'ready', 'in_progress', 'completed']),
  questions: z.array(mockExamQuestionSchema).optional(),
  attempt: z
    .object({
      id: z.string().uuid(),
      attemptNo: z.number().int(),
      startedAt: z.string(),
      endsAt: z.string(),
      finishedAt: z.string().nullable(),
    })
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

export type CreateMockExamInput = z.infer<typeof createMockExamSchema>;
export type MockExamDto = z.infer<typeof mockExamDtoSchema>;
export type MockResultsDto = z.infer<typeof mockResultsSchema>;
