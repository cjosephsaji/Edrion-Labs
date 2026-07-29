import { z } from 'zod';
import { examTopicVerdictSchema } from '../exam-grading';

export const mockSelfGradeCriterionSchema = z.object({
  criterionId: z.string().min(1).max(32),
  description: z.string().min(1).max(500),
  marksMax: z.number().int().min(0).max(100),
  marksAwarded: z.number().int().min(0).max(100),
});

export const mockSelfGradeInputSchema = z.object({
  criteria: z.array(mockSelfGradeCriterionSchema).min(1).max(5),
  note: z.string().max(2000).optional(),
});
export type MockSelfGradeInput = z.infer<typeof mockSelfGradeInputSchema>;

export const mockAiComparatorSchema = z.object({
  criteria: z.array(mockSelfGradeCriterionSchema).min(1).max(5),
  awardedMarks: z.number().min(0),
  confidence: z.enum(['high', 'medium', 'low', 'n_a']),
  note: z.string().max(2000).optional(),
  samples: z.number().int().min(0).max(3).optional(),
});

/**
 * Subjective evaluation: self is authoritative; AI is post-self comparator only.
 * final_source is always 'self' for subjective questions.
 */
export const mockAnswerEvaluationSchema = z.object({
  verdict: examTopicVerdictSchema.optional(),
  awardedMarks: z.number().min(0),
  maxMarks: z.number().min(0),
  objective: z.boolean().default(true),
  self: mockSelfGradeInputSchema.optional(),
  ai: mockAiComparatorSchema.optional(),
  final_source: z.enum(['objective', 'self']).default('objective'),
  note: z.string().max(2000).optional(),
});
export type MockAnswerEvaluation = z.infer<typeof mockAnswerEvaluationSchema>;

export const mockResultsCacheSchema = z.object({
  scoringVersion: z.string(),
  awardedMarks: z.number(),
  maxMarks: z.number(),
  objectiveAwarded: z.number().optional(),
  objectiveMax: z.number().optional(),
  awaitingSelfGradeCount: z.number().int().nonnegative().optional(),
  bySection: z.array(
    z.object({
      sectionId: z.string(),
      sectionName: z.string(),
      awardedMarks: z.number(),
      maxMarks: z.number(),
    }),
  ),
  byTopic: z.array(
    z.object({
      topicLabel: z.string(),
      topicId: z.string().uuid().nullable().optional(),
      verdict: examTopicVerdictSchema,
      awardedMarks: z.number(),
      maxMarks: z.number(),
      questionCount: z.number().int(),
      accuracy: z.number().min(0).max(1).optional(),
    }),
  ),
  timeAnalysis: z
    .object({
      totalSpentMs: z.number().int().nonnegative(),
      allottedMs: z.number().int().nonnegative(),
      outliers: z
        .array(
          z.object({
            questionId: z.string().uuid(),
            sequence: z.number().int(),
            timeSpentMs: z.number().int(),
            marks: z.number().int(),
          }),
        )
        .optional(),
    })
    .optional(),
  explanations: z.record(z.string()).optional(),
  tabSwitches: z.number().int().nonnegative().optional(),
  showAiGrades: z.boolean().optional(),
});
export type MockResultsCache = z.infer<typeof mockResultsCacheSchema>;

/** Past-mistakes projection item — derived, not a table. */
export const mockPastMistakeItemSchema = z.object({
  id: z.string(),
  mockExamId: z.string().uuid(),
  attemptId: z.string().uuid(),
  questionId: z.string().uuid(),
  topicLabel: z.string(),
  qtype: z.string(),
  prompt: z.string(),
  verdict: examTopicVerdictSchema,
  awardedMarks: z.number(),
  maxMarks: z.number(),
  answeredAt: z.string().optional(),
});
export type MockPastMistakeItem = z.infer<typeof mockPastMistakeItemSchema>;

export const MOCK_PSYCHOMETRIC_MIN_N = 30;

export const mockItemPsychometricsSchema = z.object({
  questionBankId: z.string().uuid(),
  n: z.number().int().nonnegative(),
  p: z.number().min(0).max(1).nullable(),
  avgTimeMs: z.number().int().nonnegative().nullable(),
  effectiveBand: z.enum(['easy', 'medium', 'hard']).nullable(),
  declaredBand: z.string().nullable().optional(),
  mismatch: z.boolean().optional(),
});
export type MockItemPsychometrics = z.infer<typeof mockItemPsychometricsSchema>;

export const mockLabMocksSettingsSchema = z.object({
  aggregates_enabled: z.boolean().default(false),
  aggregate_scope: z.enum(['activity_only', 'activity_and_scores']).default('activity_only'),
  min_cohort_size: z.number().int().min(1).max(10_000).default(10),
  /** Hard-coded false for voluntary mocks — not a knob. */
  individual_scores_visible: z.literal(false).default(false),
});
export type MockLabMocksSettings = z.infer<typeof mockLabMocksSettingsSchema>;

export const mockBankImportRowSchema = z.object({
  prompt: z.string().min(1),
  qtype: z.string().min(1),
  difficulty: z.string().min(1),
  topicLabel: z.string().min(1),
  topicTags: z.array(z.string()).optional(),
  options: z.string().optional(),
  correctKey: z.string().optional(),
  explanation: z.string().optional(),
});

export const mockRemediationEntrySchema = z.object({
  entryPoint: z.literal('bad_result'),
  goal: z.literal('remediation'),
  source: z.literal('mock'),
  mockId: z.string().uuid(),
  topicIds: z.array(z.string()).min(1).max(20),
  emotionalContext: z.enum(['post_poor_result']).optional(),
});
export type MockRemediationEntry = z.infer<typeof mockRemediationEntrySchema>;
