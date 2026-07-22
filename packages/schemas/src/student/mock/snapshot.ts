import { z } from 'zod';
import {
  examBlueprintSchema,
  examGradingStyleSchema,
  examSkinSchema,
} from '../exam-blueprint';
import { examQuestionTypeSchema } from '../exam-questions';

/** Immutable blueprint captured on mock create — player/scorer read this only. */
export const mockBlueprintSnapshotSchema = examBlueprintSchema.extend({
  skin: examSkinSchema,
  gradingStyle: examGradingStyleSchema,
  resolvedTotalMarks: z.number().int().nonnegative(),
  resolvedTotalQuestions: z.number().int().nonnegative(),
  snapshotAt: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
});
export type MockBlueprintSnapshot = z.infer<typeof mockBlueprintSnapshotSchema>;

export const mockScopeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('topics'),
    subjectId: z.string().uuid().nullable().optional(),
    subjectLabel: z.string().min(1).max(120).optional(),
    topicIds: z.array(z.string().uuid()).max(50).optional(),
    topicLabels: z.array(z.string().min(1)).min(1).max(50),
  }),
  z.object({
    kind: z.literal('document'),
    knowledgeItemId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal('learn_segment'),
    pathId: z.string().uuid(),
    segmentIds: z.array(z.string().uuid()).min(1).max(40),
  }),
  z.object({
    kind: z.literal('mistakes'),
    windowDays: z.union([z.literal(30), z.literal(90), z.literal(0)]),
  }),
]);
export type MockScope = z.infer<typeof mockScopeSchema>;

export const MOCK_DIFFICULTIES = ['easier', 'exam_level', 'harder'] as const;
export const mockDifficultySchema = z.enum(MOCK_DIFFICULTIES);

export const MOCK_EXAM_STATUSES = [
  'draft',
  'queued',
  'generating',
  'ready',
  'generation_failed',
  'scheduled',
  'in_progress',
  'submitted',
  'scoring',
  'awaiting_self_grade',
  'scored',
  'expired',
  'abandoned',
  // Legacy retained for read compatibility
  'completed',
  'failed',
  'grading',
  'graded',
] as const;
export const mockExamStatusSchema = z.enum(MOCK_EXAM_STATUSES);

export const MOCK_ANSWER_STATES = [
  'unseen',
  'seen',
  'answered',
  'marked',
  'marked_answered',
] as const;
export const mockAnswerStateSchema = z.enum(MOCK_ANSWER_STATES);

export const MOCK_ANSWER_MODES = ['type', 'photo', 'on_paper'] as const;
export const mockAnswerModeSchema = z.enum(MOCK_ANSWER_MODES);

export const MOCK_GENERATION_SHORTFALL_THRESHOLD = 0.6;

export const mockGenerationMetaSchema = z.object({
  requestedCount: z.number().int().nonnegative(),
  acceptedCount: z.number().int().nonnegative(),
  bankCount: z.number().int().nonnegative().optional(),
  aiCount: z.number().int().nonnegative().optional(),
  fillRatio: z.number().min(0).max(1).optional(),
  shortfall: z.boolean().optional(),
  failureReason: z.string().max(500).optional(),
  stages: z.array(z.string()).optional(),
});
export type MockGenerationMeta = z.infer<typeof mockGenerationMetaSchema>;

export const mockPlayerQuestionSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int(),
  topic: z.string(),
  qtype: examQuestionTypeSchema,
  prompt: z.string(),
  options: z.array(z.object({ key: z.string(), label: z.string() })).nullable().optional(),
  marks: z.number().int(),
  sectionId: z.string().optional(),
  difficulty: z.string().optional(),
  /** Keys stripped until submitted/authorized. */
  payload: z.record(z.unknown()).optional(),
  source: z.enum(['bank', 'ai']).optional(),
});

export const mockPlayerStateSchema = z.object({
  attemptId: z.string().uuid(),
  mockExamId: z.string().uuid(),
  status: z.enum(['in_progress', 'submitted', 'scoring', 'awaiting_self_grade', 'scored', 'expired', 'abandoned']),
  startedAt: z.string(),
  endsAt: z.string(),
  serverNow: z.string(),
  currentSectionId: z.string().nullable().optional(),
  sectionDeadlines: z.record(z.string()).nullable().optional(),
  strictMode: z.boolean(),
  tabSwitches: z.number().int().nonnegative().optional(),
  skin: examSkinSchema,
  questions: z.array(mockPlayerQuestionSchema),
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      state: mockAnswerStateSchema,
      flagged: z.boolean(),
      timeSpentMs: z.number().int().nonnegative(),
      answerMode: mockAnswerModeSchema.nullable().optional(),
      payload: z.record(z.unknown()).nullable().optional(),
      clientUpdatedAt: z.string().nullable().optional(),
    }),
  ),
});
export type MockPlayerState = z.infer<typeof mockPlayerStateSchema>;

export const MOCK_ANSWER_GRACE_MS = 120_000;
