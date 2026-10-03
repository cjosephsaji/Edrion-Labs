import { z } from "zod";
import { petrosMoveTypeSchema } from "./petros-topic-profiles";
import { petrosAssessmentSchema, unknownAssessmentConditions } from './petros-assessment';

export const PETROS_LEARNER_EVIDENCE_SCHEMA_VERSION =
  "petros.learner-evidence.v1";
export const PETROS_LEARNER_MODEL_ALGORITHM_VERSION =
  "petros.learner-model.stage6.v1";
export const PETROS_LEARNER_SNAPSHOT_SCHEMA_VERSION =
  "petros.learner-snapshot.v1";

export const PETROS_LEARNING_EVIDENCE_SOURCES = [
  "petros",
  "library_quiz",
  "mock_exam",
  "exam",
  "assignment",
  "homework",
  "flashcard_review",
  "authorized_import",
] as const;
export const PETROS_EVIDENCE_KINDS = [
  "recall",
  "application",
  "prerequisite",
  "procedure",
  "engagement",
] as const;
export const PETROS_EVIDENCE_OUTCOMES = [
  "correct",
  "partial",
  "wrong",
  "skipped",
  "invalid",
] as const;
export const PETROS_ERROR_CATEGORIES = [
  "none",
  "concept_gap",
  "prerequisite_gap",
  "procedural_method",
  "arithmetic_slip",
  "misreading",
  "time_pressure",
  "notation",
  "other",
  "unclassified",
] as const;

export const petrosLearningEvidenceSourceSchema = z.enum(
  PETROS_LEARNING_EVIDENCE_SOURCES,
);
export const petrosEvidenceKindSchema = z.enum(PETROS_EVIDENCE_KINDS);
export const petrosEvidenceOutcomeSchema = z.enum(PETROS_EVIDENCE_OUTCOMES);
export const petrosErrorCategorySchema = z.enum(PETROS_ERROR_CATEGORIES);
export type PetrosErrorCategory = z.infer<typeof petrosErrorCategorySchema>;
const learnerConfidenceSchema = z.enum(["sure", "think_so", "guessing"]);

/** Provider-neutral, append-oriented contract shared by Petros, quizzes, mocks, and exams. */
export const petrosNormalizedLearningEvidenceSchema = z
  .object({
    schemaVersion: z.literal(PETROS_LEARNER_EVIDENCE_SCHEMA_VERSION),
    source: petrosLearningEvidenceSourceSchema,
    sourceEventId: z.string().trim().min(1).max(240),
    sourceRecordId: z.string().trim().min(1).max(240).nullable().default(null),
    conceptId: z.string().trim().min(1).max(180),
    topicId: z.string().trim().min(1).max(180),
    prerequisiteConceptIds: z
      .array(z.string().trim().min(1).max(180))
      .max(12)
      .default([]),
    evidenceKind: petrosEvidenceKindSchema,
    outcome: petrosEvidenceOutcomeSchema,
    creditBasisPoints: z.number().int().min(0).max(10_000),
    moveType: petrosMoveTypeSchema.nullable().default(null),
    profileDimension: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .nullable()
      .default(null),
    preEvidenceBasisPoints: z
      .number()
      .int()
      .min(0)
      .max(10_000)
      .nullable()
      .default(null),
    postEvidenceBasisPoints: z
      .number()
      .int()
      .min(0)
      .max(10_000)
      .nullable()
      .default(null),
    responseTimeMs: z
      .number()
      .int()
      .min(0)
      .max(86_400_000)
      .nullable()
      .default(null),
    hintCount: z.number().int().min(0).max(100).default(0),
    confidenceBefore: learnerConfidenceSchema.nullable().default(null),
    confidenceAfter: learnerConfidenceSchema.nullable().default(null),
    errorCategory: petrosErrorCategorySchema.default("unclassified"),
    errorConfidenceBasisPoints: z.number().int().min(0).max(10_000).default(0),
    evaluatorVersion: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .nullable()
      .default(null),
    algorithmVersion: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .default(PETROS_LEARNER_MODEL_ALGORITHM_VERSION),
    environment: z.enum(["production", "evaluation"]).default("production"),
    synthetic: z.boolean().default(false),
    occurredAt: z.string().datetime(),
    metadata: z.record(z.unknown()).default({}),
  })
  .strict();
export type PetrosNormalizedLearningEvidence = z.infer<
  typeof petrosNormalizedLearningEvidenceSchema
>;

/** V1 stays strict and unchanged; non-objective results never need a synthetic score. */
export const petrosAssessmentEvidenceSchema = petrosNormalizedLearningEvidenceSchema.omit({
  outcome: true, creditBasisPoints: true, preEvidenceBasisPoints: true, postEvidenceBasisPoints: true,
}).extend({
  schemaVersion: z.literal('petros.learner-evidence.v2'),
  assessment: petrosAssessmentSchema,
}).strict();
export type PetrosAssessmentEvidence = z.infer<typeof petrosAssessmentEvidenceSchema>;
export const petrosLearningEvidenceInputSchema = z.union([
  petrosNormalizedLearningEvidenceSchema, petrosAssessmentEvidenceSchema,
]);
export type PetrosLearningEvidenceInput = z.infer<typeof petrosLearningEvidenceInputSchema>;

export function adaptLegacyLearningEvidence(raw: PetrosNormalizedLearningEvidence): PetrosAssessmentEvidence {
  const input = petrosNormalizedLearningEvidenceSchema.parse(raw);
  const { outcome, creditBasisPoints, preEvidenceBasisPoints: _pre, postEvidenceBasisPoints: _post, ...common } = input;
  return petrosAssessmentEvidenceSchema.parse({ ...common, schemaVersion: 'petros.learner-evidence.v2',
    assessment: { schemaVersion: 'petros.assessment.v1', origin: 'legacy_adapter',
      conditions: unknownAssessmentConditions(input.occurredAt),
      result: { kind: 'objective', judgment: outcome === 'invalid' || outcome === 'skipped'
        ? { status: 'not_evaluated', reason: outcome === 'invalid' ? 'invalid_response' : 'skipped' }
        : { status: 'evaluated', outcome, creditBasisPoints },
        feedback: 'Imported objective result; historical assessment conditions are unknown.', evidence: [],
        provenance: { evaluator: 'legacy', evaluatorVersion: input.evaluatorVersion ?? input.schemaVersion,
          evaluatedAt: input.occurredAt, uncertainty: 'unknown', review: 'not_required' } } } });
}

const uncertaintyFields = {
  evidenceCount: z.number().int().nonnegative(),
  confidenceBasisPoints: z.number().int().min(0).max(10_000),
  uncertaintyBasisPoints: z.number().int().min(0).max(10_000),
  lastEvidenceAt: z.string().datetime().nullable(),
  evidenceAgeDays: z.number().nonnegative().nullable(),
};

export const petrosLearnerMasterySnapshotSchema = z
  .object({
    conceptId: z.string(),
    topicId: z.string(),
    prerequisiteConceptIds: z.array(z.string()),
    masteryBasisPoints: z.number().int().min(0).max(10_000),
    recallBasisPoints: z.number().int().min(0).max(10_000),
    applicationBasisPoints: z.number().int().min(0).max(10_000),
    evidenceSources: z.record(z.number().int().nonnegative()),
    nextReviewAt: z.string().datetime().nullable(),
    ...uncertaintyFields,
  })
  .strict();

export const petrosLearnerMoveOutcomeSnapshotSchema = z
  .object({
    moveType: petrosMoveTypeSchema,
    topicId: z.string().nullable(),
    profileDimension: z.string().nullable(),
    successes: z.number().int().nonnegative(),
    failures: z.number().int().nonnegative(),
    skips: z.number().int().nonnegative(),
    meanPreBasisPoints: z.number().int().min(0).max(10_000),
    meanPostBasisPoints: z.number().int().min(0).max(10_000),
    meanResponseTimeMs: z.number().int().nonnegative(),
    hintUses: z.number().int().nonnegative(),
    confidenceChangeBasisPoints: z.number().int().min(-10_000).max(10_000),
    weightAdjustmentBasisPoints: z.number().int().min(-3_000).max(3_000),
    ...uncertaintyFields,
  })
  .strict();

export const petrosLearnerPreferenceSnapshotSchema = z
  .object({
    pace: z.enum(["neutral", "deliberate", "balanced", "fast"]),
    depth: z.enum(["neutral", "concise", "balanced", "deep"]),
    observed: z
      .object({
        skips: z.number().int().nonnegative(),
        expands: z.number().int().nonnegative(),
        reads: z.number().int().nonnegative(),
        responses: z.number().int().nonnegative(),
        meanResponseTimeMs: z.number().int().nonnegative(),
      })
      .strict(),
    evidenceCount: z.number().int().nonnegative(),
    confidenceBasisPoints: z.number().int().min(0).max(10_000),
    minimumEvidenceMet: z.boolean(),
  })
  .strict();

export const petrosLearnerErrorSnapshotSchema = z
  .object({
    category: petrosErrorCategorySchema,
    count: z.number().int().positive(),
    contexts: z.array(z.string()).max(6),
    confidenceBasisPoints: z.number().int().min(0).max(10_000),
    lastEvidenceAt: z.string().datetime(),
    evidenceAgeDays: z.number().nonnegative(),
    remedy: z.string().min(3).max(300),
  })
  .strict();

export const petrosLearnerCalibrationBucketSchema = z
  .object({
    confidence: learnerConfidenceSchema,
    outcome: z.enum(["correct", "partial", "wrong"]),
    count: z.number().int().nonnegative(),
  })
  .strict();

export const petrosLearnerSessionOverrideSchema = z
  .object({
    pace: z.enum(["deliberate", "balanced", "fast"]).nullable(),
    depth: z.enum(["concise", "balanced", "deep"]).nullable(),
    source: z.literal("student_current_session"),
    updatedAt: z.string().datetime(),
  })
  .strict();

/** Deliberately bounded PLAN input: relevant summaries, uncertainty, age, and causal facts only. */
export const petrosLearnerSnapshotSchema = z
  .object({
    schemaVersion: z.literal(PETROS_LEARNER_SNAPSHOT_SCHEMA_VERSION),
    algorithmVersion: z.string(),
    generatedAt: z.string().datetime(),
    topicId: z.string(),
    neutral: z.boolean(),
    stale: z.boolean(),
    mastery: z.array(petrosLearnerMasterySnapshotSchema).max(8),
    moveOutcomes: z.array(petrosLearnerMoveOutcomeSnapshotSchema).max(8),
    preference: petrosLearnerPreferenceSnapshotSchema,
    sessionOverride: petrosLearnerSessionOverrideSchema.nullable(),
    errors: z.array(petrosLearnerErrorSnapshotSchema).max(6),
    calibration: z
      .object({
        buckets: z.array(petrosLearnerCalibrationBucketSchema).length(9),
        scoreBasisPoints: z.number().int().min(0).max(10_000),
        uncertaintyBasisPoints: z.number().int().min(0).max(10_000),
        fragileConfidence: z.boolean(),
        evidenceCount: z.number().int().nonnegative(),
      })
      .strict(),
    causalFactors: z.array(z.string().min(3).max(240)).max(8),
    evidenceEventIds: z.array(z.string()).max(24),
  })
  .strict();
export type PetrosLearnerSnapshot = z.infer<typeof petrosLearnerSnapshotSchema>;

export const petrosLearnerModelDiagnosticQuerySchema = z
  .object({
    institutionId: z.string().uuid(),
    studentId: z.string().uuid(),
    topicId: z.string().trim().min(1).max(180).optional(),
  })
  .strict();
export type PetrosLearnerModelDiagnosticQuery = z.infer<
  typeof petrosLearnerModelDiagnosticQuerySchema
>;

export const petrosLearnerModelRebuildSchema = z
  .object({
    institutionId: z.string().uuid(),
    studentId: z.string().uuid(),
    algorithmVersion: z
      .string()
      .trim()
      .min(3)
      .max(160)
      .default(PETROS_LEARNER_MODEL_ALGORITHM_VERSION),
    reason: z.string().trim().min(8).max(500),
    batchSize: z.number().int().min(1).max(500).default(100),
  })
  .strict();
export type PetrosLearnerModelRebuildInput = z.input<
  typeof petrosLearnerModelRebuildSchema
>;

export const petrosLearnerModelJobActionSchema = z
  .object({ reason: z.string().trim().min(8).max(500) })
  .strict();
export type PetrosLearnerModelJobActionInput = z.infer<
  typeof petrosLearnerModelJobActionSchema
>;

export const petrosLearnerModelImportSchema = z
  .object({
    institutionId: z.string().uuid(),
    studentId: z.string().uuid(),
    evidence: z.array(petrosLearningEvidenceInputSchema).min(1).max(500),
    reason: z.string().trim().min(8).max(500),
  })
  .strict();
export type PetrosLearnerModelImportInput = z.infer<
  typeof petrosLearnerModelImportSchema
>;

export const petrosLearnerModelSourceSyncSchema = z
  .object({
    institutionId: z.string().uuid(),
    studentId: z.string().uuid(),
    reason: z.string().trim().min(8).max(500),
  })
  .strict();
export type PetrosLearnerModelSourceSyncInput = z.infer<
  typeof petrosLearnerModelSourceSyncSchema
>;

export const petrosLearnerModelDeleteSchema = z
  .object({
    institutionId: z.string().uuid(),
    studentId: z.string().uuid(),
    reason: z.string().trim().min(8).max(500),
  })
  .strict();
export type PetrosLearnerModelDeleteInput = z.infer<
  typeof petrosLearnerModelDeleteSchema
>;
