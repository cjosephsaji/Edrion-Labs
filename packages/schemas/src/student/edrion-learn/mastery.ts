import { z } from 'zod';

export const masteryDifficultySchema = z.enum(['easy', 'medium', 'hard']);

export const MASTERY_DIFFICULTY_RATINGS = {
  easy: 1100,
  medium: 1300,
  hard: 1500,
} as const;

export const MASTERY_RATING_MIN = 400;
export const MASTERY_RATING_MAX = 2400;
/**
 * Hyperspec §6: the display transform is m = clamp((r - 800) / 800, 0, 1), so a
 * new learner must start at 1200 to read 0.5 mastery (and to expect p ≈ 0.36 on
 * a first medium-difficulty attempt). Mirrors learner_mastery.rating's DB
 * default — see migration 0103_learn_tenancy_reconcile.
 */
export const MASTERY_RATING_DEFAULT = 1200;
export const MASTERY_K_HIGH = 32;
export const MASTERY_K_LOW = 16;
export const MASTERY_K_ATTEMPT_THRESHOLD = 10;
/** Hyperspec §1.4 rung 1b: evaluation.score ≥ threshold ⇒ treat as correct. */
export const MASTERY_SCORE_CORRECT_THRESHOLD = 0.7;

export const pacePreferenceSchema = z.enum(['slow', 'normal', 'fast']);
export type PacePreference = z.infer<typeof pacePreferenceSchema>;

export const moveOutcomeBucketSchema = z.object({
  correct: z.number().int().nonnegative().default(0),
  wrong: z.number().int().nonnegative().default(0),
  null_count: z.number().int().nonnegative().default(0),
  escaped: z.number().int().nonnegative().default(0),
  expanded_deeper: z.number().int().nonnegative().default(0),
  skipped: z.number().int().nonnegative().default(0),
  count: z.number().int().nonnegative().default(0),
});

export type MoveOutcomeBucket = z.infer<typeof moveOutcomeBucketSchema>;

export const learnerMasterySchema = z.object({
  id: z.string().uuid(),
  atomId: z.string().uuid(),
  rating: z.number().int().min(MASTERY_RATING_MIN).max(MASTERY_RATING_MAX),
  attempts: z.number().int().nonnegative(),
  correctWeight: z.number().nonnegative(),
  lastAttemptAt: z.string().datetime().nullable().optional(),
  displayMastery: z.number().min(0).max(1),
  version: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});

export type LearnerMasteryDto = z.infer<typeof learnerMasterySchema>;

/** Display mastery m = clamp((r-800)/800, 0, 1). */
export function ratingToDisplayMastery(rating: number): number {
  const m = (rating - 800) / 800;
  return Math.min(1, Math.max(0, m));
}

export const attemptEvaluationSchema = z.object({
  correct: z.boolean().nullable().optional(),
  score: z.number().min(0).max(1).optional(),
  feedback: z.string().max(500).optional(),
});

export type AttemptEvaluation = z.infer<typeof attemptEvaluationSchema>;

export const learnAttemptInputSchema = z.object({
  question_id: z.string().min(1).max(40).optional(),
  response: z.unknown(),
});

export const learnAttemptSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid().nullable().optional(),
  blockId: z.string().uuid().nullable().optional(),
  questionId: z.string().nullable().optional(),
  kind: z.string(),
  input: learnAttemptInputSchema.or(z.record(z.unknown())),
  evaluation: attemptEvaluationSchema.or(z.record(z.unknown())),
  hintsUsed: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime(),
});

export type LearnAttemptDto = z.infer<typeof learnAttemptSchema>;

export const learnerModelEventTypeSchema = z.enum([
  'mastery_update',
  'context_set',
  'fatigue_detected',
  'break_suggested',
  'profile_generated',
  'profile_overridden',
]);

export const masteryUpdatePayloadSchema = z.object({
  atom_id: z.string().uuid(),
  rating_before: z.number().int(),
  rating_after: z.number().int(),
  outcome: z.boolean().nullable(),
  k: z.number(),
  expected_p: z.number(),
  source_block_id: z.string().uuid().optional(),
  hinted: z.boolean().optional(),
});

export const learnerModelEventSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid().nullable().optional(),
  attemptId: z.string().uuid().nullable().optional(),
  atomId: z.string().uuid().nullable().optional(),
  eventType: learnerModelEventTypeSchema,
  payload: z.record(z.unknown()),
  idempotencyKey: z.string().min(1),
  occurredAt: z.string().datetime(),
});

export type LearnerModelEventDto = z.infer<typeof learnerModelEventSchema>;
