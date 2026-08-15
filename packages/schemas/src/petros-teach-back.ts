import { z } from 'zod';

export const PETROS_TEACH_BACK_STATE_VERSION = 'petros.teach-back.state.v1' as const;
export const PETROS_TEACH_BACK_ANALYSIS_VERSION = 'petros.teach-back.analysis.v1' as const;
export const PETROS_TEACH_BACK_FOLLOW_UP_VERSION = 'petros.teach-back.follow-up.v1' as const;
export const PETROS_TEACH_BACK_VERDICT_VERSION = 'petros.teach-back.verdict.v1' as const;
export const PETROS_TEACH_BACK_FUNCTIONS = {
  analyse: 'teach_back.explanation.analyse',
  followUp: 'teach_back.follow_up.generate',
  verdict: 'teach_back.verdict.generate',
} as const;

export const PETROS_TEACH_BACK_GAP_TYPES = [
  'missing_causal_link',
  'undefined_term',
  'unhandled_exception',
  'weak_example',
  'contradiction',
  'misconception',
  'scope_gap',
  'none',
] as const;

export const petrosTeachBackGapTypeSchema = z.enum(PETROS_TEACH_BACK_GAP_TYPES);
export const petrosTeachBackModeSchema = z.enum(['text', 'voice']);
export const petrosTeachBackStatusSchema = z.enum(['active', 'paused', 'closed']);
export const petrosTeachBackAudienceLevelSchema = z.enum([
  'younger_student',
  'classmate',
  'beginner_adult',
]);

const bounded = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);
const evidenceLinkSchema = z
  .object({
    segmentId: z.string().uuid(),
    excerpt: bounded(1, 320),
  })
  .strict();

export const petrosTeachBackCoverageItemSchema = z
  .object({
    key: bounded(1, 120),
    label: bounded(2, 240),
    status: z.enum(['unseen', 'covered', 'partial', 'missing']),
    evidence: z.array(evidenceLinkSchema).max(4),
  })
  .strict();

export const petrosTeachBackAnalysisSchema = z
  .object({
    schemaVersion: z.literal(PETROS_TEACH_BACK_ANALYSIS_VERSION),
    coverage: z.array(petrosTeachBackCoverageItemSchema).min(1).max(16),
    claims: z
      .array(
        z
          .object({
            claim: bounded(2, 500),
            status: z.enum(['supported', 'ambiguous', 'contradicted', 'unverifiable']),
            evidence: evidenceLinkSchema,
          })
          .strict(),
      )
      .max(16),
    examples: z.array(evidenceLinkSchema).max(8),
    primaryGap: z
      .object({
        type: petrosTeachBackGapTypeSchema.exclude(['none']),
        description: bounded(3, 500),
        evidence: evidenceLinkSchema,
        confidence: z.number().min(0).max(1),
      })
      .strict()
      .nullable(),
    completeEnough: z.boolean(),
    needsFollowUp: z.boolean(),
    speechRecognitionUncertain: z.boolean(),
    uncertaintyDisclosure: z.string().trim().max(500).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.speechRecognitionUncertain && value.primaryGap) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['primaryGap'],
        message: 'Speech-recognition uncertainty cannot be recorded as a conceptual gap.',
      });
    }
    if (value.needsFollowUp !== Boolean(value.primaryGap)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['needsFollowUp'],
        message: 'Follow-up state must match the presence of a grounded gap.',
      });
    }
  });
export type PetrosTeachBackAnalysis = z.infer<typeof petrosTeachBackAnalysisSchema>;

export const petrosTeachBackFollowUpSchema = z
  .object({
    schemaVersion: z.literal(PETROS_TEACH_BACK_FOLLOW_UP_VERSION),
    gapType: petrosTeachBackGapTypeSchema.exclude(['none']),
    question: bounded(5, 500),
    groundedIn: evidenceLinkSchema,
    probeNumber: z.number().int().min(1).max(2),
    juniorTransition: bounded(5, 240),
    helpAfterCap: bounded(8, 1_000).nullable(),
    tone: z.enum(['curious', 'playfully_persistent', 'plain']),
  })
  .strict()
  .superRefine((value, ctx) => {
    const questions = (value.question.match(/\?/g) ?? []).length;
    if (questions !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['question'],
        message: 'A junior follow-up must ask exactly one clear question.',
      });
    }
    if (value.probeNumber === 2 && !value.helpAfterCap) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['helpAfterCap'],
        message: 'The second probe must carry immediate help for the cap.',
      });
    }
  });
export type PetrosTeachBackFollowUp = z.infer<typeof petrosTeachBackFollowUpSchema>;

const noScoreLanguage = (value: string) =>
  !/(?:\bscore\b|\bgrade\b|\bmarks?\b|\brating\b|\b\d+(?:\.\d+)?\s*%|\b\d+\s*\/\s*\d+)/i.test(
    value,
  );

export const petrosTeachBackVerdictSchema = z
  .object({
    schemaVersion: z.literal(PETROS_TEACH_BACK_VERDICT_VERSION),
    oneLine: bounded(8, 360).refine(
      noScoreLanguage,
      'The verdict cannot contain a score or grade.',
    ),
    clear: z
      .array(z.object({ detail: bounded(2, 500), evidence: evidenceLinkSchema }).strict())
      .min(1)
      .max(5),
    mostImportantGap: z
      .object({
        type: petrosTeachBackGapTypeSchema.exclude(['none']),
        detail: bounded(3, 500),
        evidence: evidenceLinkSchema,
      })
      .strict()
      .nullable(),
    suggestedImprovement: bounded(5, 700),
    audienceFit: z.enum(['likely_helpful', 'helpful_after_revision', 'not_yet_clear']),
    audienceReason: bounded(5, 500),
    uncertaintyDisclosure: z.string().trim().max(500).nullable(),
    recapProposal: z
      .object({
        kind: z.enum(['note', 'flashcard']),
        title: bounded(2, 200),
        body: bounded(5, 4_000),
      })
      .strict()
      .nullable(),
    officialAssessmentChanged: z.literal(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    const text = JSON.stringify(value);
    if (!noScoreLanguage(text)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Verdict details cannot contain a score or grade.',
      });
    }
  });
export type PetrosTeachBackVerdict = z.infer<typeof petrosTeachBackVerdictSchema>;

export const createPetrosTeachBackSessionSchema = z
  .object({
    topic: bounded(2, 240),
    scope: z.string().trim().max(600).nullable().default(null),
    audienceLevel: petrosTeachBackAudienceLevelSchema.default('younger_student'),
    audienceLabel: bounded(2, 120).default('a curious junior student'),
    mode: petrosTeachBackModeSchema.default('text'),
    language: bounded(2, 40).default('en'),
    coverageChecklist: z
      .array(z.object({ key: bounded(1, 120), label: bounded(2, 240) }).strict())
      .min(1)
      .max(16)
      .optional(),
    timeBudgetSeconds: z.number().int().min(300).max(1_800).default(720),
    maxMoves: z.number().int().min(2).max(12).default(8),
    repeatedFromSessionId: z.string().uuid().nullable().default(null),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type CreatePetrosTeachBackSessionInput = z.input<typeof createPetrosTeachBackSessionSchema>;

export const submitPetrosTeachBackSegmentSchema = z
  .object({
    text: bounded(1, 8_000),
    source: petrosTeachBackModeSchema,
    mediaId: z.string().uuid().nullable().default(null),
    responseToFollowUpId: z.string().uuid().nullable().default(null),
    transcriptionConfidence: z.number().min(0).max(1).nullable().default(null),
    uncertainTranscript: z.boolean().default(false),
    expectedVersion: z.number().int().nonnegative(),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.source === 'voice' && !value.mediaId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mediaId'],
        message: 'Voice segments require owner-scoped media.',
      });
    }
  });
export type SubmitPetrosTeachBackSegmentInput = z.input<typeof submitPetrosTeachBackSegmentSchema>;

export const correctPetrosTeachBackSegmentSchema = z
  .object({
    text: bounded(1, 8_000),
    expectedVersion: z.number().int().nonnegative(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type CorrectPetrosTeachBackSegmentInput = z.infer<
  typeof correctPetrosTeachBackSegmentSchema
>;

export const petrosTeachBackHelpSchema = z
  .object({
    action: z.enum(['hint', 'help', 'i_dont_know', 'skip']),
    followUpId: z.string().uuid().nullable().default(null),
    expectedVersion: z.number().int().nonnegative(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type PetrosTeachBackHelpInput = z.input<typeof petrosTeachBackHelpSchema>;

export const petrosTeachBackLifecycleSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type PetrosTeachBackLifecycleInput = z.infer<typeof petrosTeachBackLifecycleSchema>;

export const petrosTeachBackSegmentSchema = z
  .object({
    id: z.string().uuid(),
    ordinal: z.number().int().positive(),
    source: petrosTeachBackModeSchema,
    text: z.string(),
    corrected: z.boolean(),
    transcriptionConfidence: z.number().min(0).max(1).nullable(),
    responseToFollowUpId: z.string().uuid().nullable(),
    analysis: petrosTeachBackAnalysisSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const petrosTeachBackFollowUpStateSchema = z
  .object({
    id: z.string().uuid(),
    segmentId: z.string().uuid(),
    status: z.enum(['open', 'answered', 'helped', 'skipped']),
    followUp: petrosTeachBackFollowUpSchema,
    createdAt: z.string().datetime(),
    resolvedAt: z.string().datetime().nullable(),
  })
  .strict();

export const petrosTeachBackSessionDocumentSchema = z
  .object({
    stateVersion: z.literal(PETROS_TEACH_BACK_STATE_VERSION),
    id: z.string().uuid(),
    learningSessionId: z.string().uuid(),
    version: z.number().int().nonnegative(),
    status: petrosTeachBackStatusSchema,
    topic: z.string(),
    scope: z.string().nullable(),
    audience: z.object({ level: petrosTeachBackAudienceLevelSchema, label: z.string() }).strict(),
    mode: petrosTeachBackModeSchema,
    language: z.string(),
    coverageChecklist: z.array(petrosTeachBackCoverageItemSchema),
    segments: z.array(petrosTeachBackSegmentSchema),
    followUps: z.array(petrosTeachBackFollowUpStateSchema),
    progress: z
      .object({
        movesUsed: z.number().int().nonnegative(),
        maxMoves: z.number().int().positive(),
        elapsedSeconds: z.number().int().nonnegative(),
        timeBudgetSeconds: z.number().int().positive(),
        openFollowUpId: z.string().uuid().nullable(),
        currentGapType: petrosTeachBackGapTypeSchema,
        probesOnCurrentGap: z.number().int().min(0).max(2),
        helpUseCount: z.number().int().nonnegative(),
      })
      .strict(),
    opening: z.literal('Explain this to Petros as if teaching a junior.'),
    verdict: petrosTeachBackVerdictSchema.nullable(),
    artifactBundleId: z.string().uuid().nullable(),
    voice: z
      .object({
        optional: z.literal(true),
        productionDeviceQaPassed: z.literal(false),
        textAlternativeAvailable: z.literal(true),
        disclosure: z.string(),
      })
      .strict(),
    repeatedFromSessionId: z.string().uuid().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type PetrosTeachBackSessionDocument = z.infer<typeof petrosTeachBackSessionDocumentSchema>;

export const petrosTeachBackDashboardQuerySchema = z.object({
  institutionId: z.string().uuid().optional(),
  mode: petrosTeachBackModeSchema.optional(),
  gapType: petrosTeachBackGapTypeSchema.optional(),
  functionKey: z.string().trim().min(1).max(160).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type PetrosTeachBackDashboardQuery = z.infer<typeof petrosTeachBackDashboardQuerySchema>;
