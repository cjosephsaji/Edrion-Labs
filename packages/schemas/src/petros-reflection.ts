import { z } from 'zod';

export const PETROS_REFLECTION_SCHEMA_VERSION = 'petros.reflection.surface.v1' as const;
export const PETROS_REFLECTION_ALGORITHM_VERSION = 'petros.reflection.stage11.v1' as const;
export const PETROS_REFLECTION_RECAP_VERSION = 'petros.reflection.recap.v1' as const;
export const PETROS_REFLECTION_GAP_VERSION = 'petros.reflection.gap-alarm.v1' as const;

export const PETROS_REFLECTION_FUNCTIONS = {
  recap: 'reflection.session_recap.generate',
  gapExplanation: 'reflection.gap_explanation.generate',
} as const;

export const PETROS_REFLECTION_THRESHOLDS = {
  mapMinimumEvidence: 3,
  solidMasteryBasisPoints: 7_500,
  maximumSolidUncertaintyBasisPoints: 3_500,
  freshDays: 14,
  agingDays: 45,
  staleDays: 90,
  calibrationMinimumEvidence: 8,
  calibrationMinimumWindowEvidence: 4,
  gapMinimumIndependentEvidence: 3,
  gapMinimumAffectedTopics: 2,
  gapMinimumConfidenceBasisPoints: 6_500,
} as const;

export const PETROS_KNOWLEDGE_STATES = [
  'solid',
  'shaky',
  'untouched',
  'insufficient_evidence',
] as const;
export const petrosKnowledgeStateSchema = z.enum(PETROS_KNOWLEDGE_STATES);
export const petrosEvidenceFreshnessSchema = z.enum(['fresh', 'aging', 'stale', 'none']);

const shortText = z.string().trim().min(1).max(600);
const referenceId = z.string().trim().min(1).max(240);
const basisPoints = z.number().int().min(0).max(10_000);

export const petrosReflectionEvidenceLinkSchema = z
  .object({
    id: z.string().uuid(),
    sourceType: z.enum([
      'learner_evidence',
      'session_observation',
      'planning_decision',
      'curriculum',
      'teach_back_verdict',
    ]),
    sourceId: referenceId,
    label: shortText,
    observedAt: z.string().datetime().nullable(),
    ageDays: z.number().nonnegative().nullable(),
  })
  .strict();
export type PetrosReflectionEvidenceLink = z.infer<
  typeof petrosReflectionEvidenceLinkSchema
>;

export const petrosReflectionRankingReasonSchema = z
  .object({
    code: z.enum([
      'prerequisite_gap',
      'fragile_knowledge',
      'exam_proximity',
      'review_due',
      'learner_goal',
      'first_attempt',
    ]),
    label: shortText,
    points: z.number().int().min(0).max(10_000),
    evidenceLinkIds: z.array(z.string().uuid()).max(12),
  })
  .strict();
export type PetrosReflectionRankingReason = z.infer<
  typeof petrosReflectionRankingReasonSchema
>;

export const petrosKnowledgeMapTopicSchema = z
  .object({
    conceptId: referenceId,
    topicId: referenceId,
    title: shortText,
    subjectLabel: shortText,
    curriculumLabel: shortText,
    state: petrosKnowledgeStateSchema,
    stateExplanation: shortText,
    evidenceCount: z.number().int().nonnegative(),
    masteryBasisPoints: basisPoints.nullable(),
    uncertaintyBasisPoints: basisPoints,
    freshness: petrosEvidenceFreshnessSchema,
    evidenceAgeDays: z.number().nonnegative().nullable(),
    lastEvidenceAt: z.string().datetime().nullable(),
    prerequisiteConceptIds: z.array(referenceId).max(24),
    dependentConceptIds: z.array(referenceId).max(24),
    examRelevance: z
      .object({
        known: z.boolean(),
        label: shortText.nullable(),
        examDate: z.string().datetime().nullable(),
      })
      .strict(),
    evidence: z.array(petrosReflectionEvidenceLinkSchema).max(12),
    recommendationId: z.string().uuid().nullable(),
  })
  .strict();
export type PetrosKnowledgeMapTopic = z.infer<typeof petrosKnowledgeMapTopicSchema>;

export const petrosReflectionRecommendationSchema = z
  .object({
    id: z.string().uuid(),
    conceptId: referenceId,
    topicId: referenceId,
    title: shortText,
    actionLabel: shortText,
    sessionType: z.enum(['learn', 'revise', 'repair']),
    score: z.number().int().min(0).max(50_000),
    reasons: z.array(petrosReflectionRankingReasonSchema).min(1).max(6),
    whyThis: shortText,
    evidenceAgeDays: z.number().nonnegative().nullable(),
    status: z.enum(['active', 'started', 'completed', 'dismissed']),
  })
  .strict();
export type PetrosReflectionRecommendation = z.infer<
  typeof petrosReflectionRecommendationSchema
>;

export const petrosCalibrationInsightSchema = z
  .object({
    id: z.string().uuid(),
    eligible: z.boolean(),
    evidenceCount: z.number().int().nonnegative(),
    minimumEvidence: z.number().int().positive(),
    direction: z.enum(['over', 'under', 'aligned', 'hidden']),
    trend: z.enum(['narrowing', 'widening', 'steady', 'insufficient_history']),
    meanConfidenceBasisPoints: basisPoints.nullable(),
    meanOutcomeBasisPoints: basisPoints.nullable(),
    gapBasisPoints: z.number().int().min(-10_000).max(10_000).nullable(),
    uncertaintyBasisPoints: basisPoints,
    headline: shortText,
    explanation: shortText,
    actionRecommendationId: z.string().uuid().nullable(),
    quietUntil: z.string().datetime().nullable(),
    status: z.enum(['active', 'quieted', 'dismissed', 'hidden']),
    evidence: z.array(petrosReflectionEvidenceLinkSchema).max(24),
  })
  .strict();
export type PetrosCalibrationInsight = z.infer<typeof petrosCalibrationInsightSchema>;

export const petrosSessionRecapContentSchema = z
  .object({
    schemaVersion: z.literal(PETROS_REFLECTION_RECAP_VERSION),
    sessionId: z.string().uuid(),
    headline: shortText,
    observedFacts: z
      .array(
        z
          .object({
            text: shortText,
            evidenceLinkIds: z.array(z.string().uuid()).min(1).max(8),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    tentativeInferences: z
      .array(
        z
          .object({
            text: shortText,
            label: z.literal('Tentative'),
            evidenceLinkIds: z.array(z.string().uuid()).min(1).max(8),
          })
          .strict(),
      )
      .max(3),
    nextTry: shortText,
    durablePreferenceClaimed: z.literal(false),
    abilityLabelUsed: z.literal(false),
  })
  .strict();
export type PetrosSessionRecapContent = z.infer<typeof petrosSessionRecapContentSchema>;

export const petrosSessionRecapSchema = z
  .object({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    topic: shortText,
    closedAt: z.string().datetime(),
    content: petrosSessionRecapContentSchema,
    evidence: z.array(petrosReflectionEvidenceLinkSchema).min(1).max(24),
    status: z.enum(['active', 'corrected', 'dismissed']),
    correctedText: z.string().trim().min(2).max(1_200).nullable(),
    generation: z
      .object({
        source: z.enum(['deterministic', 'ai', 'deterministic_fallback']),
        functionKey: z.literal(PETROS_REFLECTION_FUNCTIONS.recap),
        validationPassed: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type PetrosSessionRecap = z.infer<typeof petrosSessionRecapSchema>;

export const petrosGapAlarmContentSchema = z
  .object({
    schemaVersion: z.literal(PETROS_REFLECTION_GAP_VERSION),
    prerequisiteConceptId: referenceId,
    prerequisiteLabel: shortText,
    affectedTopics: z
      .array(z.object({ topicId: referenceId, label: shortText }).strict())
      .min(PETROS_REFLECTION_THRESHOLDS.gapMinimumAffectedTopics)
      .max(12),
    independentEvidenceCount: z
      .number()
      .int()
      .min(PETROS_REFLECTION_THRESHOLDS.gapMinimumIndependentEvidence),
    confidenceBasisPoints: basisPoints,
    hypothesis: shortText,
    explanation: shortText,
    practicalMinutes: z.number().int().min(5).max(90),
    uncertaintyLabel: z.literal('Prerequisite hypothesis'),
  })
  .strict();
export type PetrosGapAlarmContent = z.infer<typeof petrosGapAlarmContentSchema>;

export const petrosGapAlarmSchema = z
  .object({
    id: z.string().uuid(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    content: petrosGapAlarmContentSchema,
    evidence: z.array(petrosReflectionEvidenceLinkSchema).min(3).max(36),
    recommendationId: z.string().uuid().nullable(),
    status: z.enum(['active', 'snoozed', 'resolved', 'dismissed', 'false_positive']),
    snoozedUntil: z.string().datetime().nullable(),
    generation: z
      .object({
        source: z.enum(['deterministic', 'ai', 'deterministic_fallback']),
        functionKey: z.literal(PETROS_REFLECTION_FUNCTIONS.gapExplanation),
        validationPassed: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type PetrosGapAlarm = z.infer<typeof petrosGapAlarmSchema>;

export const petrosReflectionSurfaceSchema = z
  .object({
    schemaVersion: z.literal(PETROS_REFLECTION_SCHEMA_VERSION),
    algorithmVersion: z.literal(PETROS_REFLECTION_ALGORITHM_VERSION),
    rebuiltAt: z.string().datetime().nullable(),
    sourceThroughAt: z.string().datetime().nullable(),
    stale: z.boolean(),
    jobLagSeconds: z.number().int().nonnegative(),
    thresholds: z.object({
      mapMinimumEvidence: z.number().int().positive(),
      solidMasteryBasisPoints: basisPoints,
      maximumSolidUncertaintyBasisPoints: basisPoints,
      freshDays: z.number().int().positive(),
      agingDays: z.number().int().positive(),
      staleDays: z.number().int().positive(),
      calibrationMinimumEvidence: z.number().int().positive(),
      calibrationMinimumWindowEvidence: z.number().int().positive(),
      gapMinimumIndependentEvidence: z.number().int().positive(),
      gapMinimumAffectedTopics: z.number().int().positive(),
      gapMinimumConfidenceBasisPoints: basisPoints,
    }).strict(),
    map: z
      .object({
        topics: z.array(petrosKnowledgeMapTopicSchema).max(300),
        relationships: z
          .array(
            z.object({ fromConceptId: referenceId, toConceptId: referenceId }).strict(),
          )
          .max(1_200),
        coverage: z.record(z.number().int().nonnegative()),
        missingSyllabusLinks: z.number().int().nonnegative(),
      })
      .strict(),
    recommendations: z.array(petrosReflectionRecommendationSchema).max(12),
    calibration: petrosCalibrationInsightSchema.nullable(),
    recaps: z.array(petrosSessionRecapSchema).max(20),
    alarms: z.array(petrosGapAlarmSchema).max(12),
    voiceRequired: z.literal(false),
    productionReady: z.literal(false),
  })
  .strict();
export type PetrosReflectionSurface = z.infer<typeof petrosReflectionSurfaceSchema>;

export const petrosReflectionRebuildSchema = z
  .object({ idempotencyKey: z.string().uuid() })
  .strict();
export type PetrosReflectionRebuildInput = z.infer<typeof petrosReflectionRebuildSchema>;

export const petrosReflectionRecommendationIntentSchema = z
  .object({ idempotencyKey: z.string().uuid() })
  .strict();
export type PetrosReflectionRecommendationIntentInput = z.infer<
  typeof petrosReflectionRecommendationIntentSchema
>;

export const petrosReflectionRecommendationLifecycleSchema = z
  .object({
    action: z.literal('dismiss'),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type PetrosReflectionRecommendationLifecycleInput = z.infer<
  typeof petrosReflectionRecommendationLifecycleSchema
>;

export const petrosCalibrationLifecycleSchema = z
  .object({
    action: z.enum(['dismiss', 'quiet']),
    quietDays: z.number().int().min(7).max(90).default(30),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type PetrosCalibrationLifecycleInput = z.input<
  typeof petrosCalibrationLifecycleSchema
>;

export const petrosRecapFeedbackSchema = z
  .object({
    action: z.enum(['correct', 'dismiss']),
    correction: z.string().trim().min(2).max(1_200).nullable().default(null),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.action === 'correct' && !value.correction) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['correction'],
        message: 'A correction is required when correcting a recap.',
      });
    }
  });
export type PetrosRecapFeedbackInput = z.input<typeof petrosRecapFeedbackSchema>;

export const petrosGapAlarmLifecycleSchema = z
  .object({
    action: z.enum(['snooze', 'resolve', 'dismiss', 'false_positive']),
    snoozeDays: z.number().int().min(1).max(90).default(14),
    reason: z.string().trim().min(2).max(500).nullable().default(null),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type PetrosGapAlarmLifecycleInput = z.input<typeof petrosGapAlarmLifecycleSchema>;

export const petrosReflectionDashboardQuerySchema = z
  .object({
    institutionId: z.string().uuid().optional(),
    algorithmVersion: z.string().trim().min(3).max(160).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .strict();
export type PetrosReflectionDashboardQuery = z.infer<
  typeof petrosReflectionDashboardQuerySchema
>;

export const petrosReflectionEvidenceQuerySchema = z
  .object({
    institutionId: z.string().uuid(),
    studentId: z.string().uuid(),
    entityType: z.enum(['map_state', 'calibration', 'recap', 'alarm']),
    entityId: z.string().uuid(),
  })
  .strict();
export type PetrosReflectionEvidenceQuery = z.infer<
  typeof petrosReflectionEvidenceQuerySchema
>;
