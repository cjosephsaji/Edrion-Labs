import { z } from 'zod';

/**
 * Complete Stage 4 teaching-move vocabulary. Opening, explaining, active, and closing groups are
 * exported separately so policy and admin surfaces can explain the lifecycle without string forks.
 */
export const PETROS_OPENING_MOVES = ['hook', 'prerequisite_check', 'goal_frame'] as const;
export const PETROS_EXPLAINING_MOVES = [
  'layered_explanation',
  'worked_example',
  'analogy',
  'story',
  'derivation',
  'diagram',
] as const;
export const PETROS_ACTIVE_MOVES = [
  'predict_then_reveal',
  'contrast_case',
  'misconception_demolition',
  'socratic_probe',
  'recall_check',
  'apply_to_your_world',
] as const;
export const PETROS_CLOSING_MOVES = ['synthesis', 'artifact_commit', 'forward_link'] as const;
export const PETROS_MOVE_TYPES = [
  ...PETROS_OPENING_MOVES,
  ...PETROS_EXPLAINING_MOVES,
  ...PETROS_ACTIVE_MOVES,
  ...PETROS_CLOSING_MOVES,
] as const;

export const PETROS_KNOWLEDGE_TYPES = [
  'conceptual',
  'procedural',
  'factual_memorisation',
  'skill_performance',
] as const;
export const PETROS_REPRESENTATIONS = [
  'visual',
  'symbolic',
  'verbal',
  'sequential',
  'comparative',
] as const;

export const PETROS_TOPIC_PROFILE_SCHEMA_VERSION = 'petros.topic-profile.v1';
export const PETROS_TOPIC_PROFILE_PROMPT_VERSION = 'stage4-topic-profile-v1';
export const PETROS_TOPIC_PROFILE_GENERATOR_VERSION = 'stage4-generator-v1';
export const PETROS_TOPIC_PROFILE_FUNCTION_KEY = 'topic.profile.generate';
export const PETROS_MOVE_RENDER_FUNCTION_KEYS = Object.fromEntries(
  PETROS_MOVE_TYPES.map((move) => [move, `teaching.move.${move}.render`]),
) as Record<(typeof PETROS_MOVE_TYPES)[number], string>;

export const petrosMoveTypeSchema = z.enum(PETROS_MOVE_TYPES);
export type PetrosMoveType = z.infer<typeof petrosMoveTypeSchema>;
export const petrosKnowledgeTypeSchema = z.enum(PETROS_KNOWLEDGE_TYPES);
export const petrosRepresentationSchema = z.enum(PETROS_REPRESENTATIONS);

const boundedText = (maximum = 500) => z.string().trim().min(1).max(maximum);
const scale = z.number().int().min(0).max(4);
const weight = z.number().int().min(0).max(10_000);
const sourceReferenceSchema = z
  .object({
    label: boundedText(200),
    reference: boundedText(600).nullable(),
    licence: boundedText(120).nullable(),
  })
  .strict();

const weightedKnowledgeSchema = z
  .array(
    z
      .object({ type: petrosKnowledgeTypeSchema, weightBasisPoints: weight })
      .strict(),
  )
  .min(1)
  .max(PETROS_KNOWLEDGE_TYPES.length)
  .superRefine((items, ctx) => {
    if (new Set(items.map((item) => item.type)).size !== items.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Knowledge types must be unique.' });
    if (items.reduce((sum, item) => sum + item.weightBasisPoints, 0) !== 10_000)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Knowledge-type weights must total 10,000 basis points.',
      });
  });

const weightedRepresentationSchema = z
  .array(
    z
      .object({ type: petrosRepresentationSchema, weightBasisPoints: weight })
      .strict(),
  )
  .min(1)
  .max(PETROS_REPRESENTATIONS.length)
  .superRefine((items, ctx) => {
    if (new Set(items.map((item) => item.type)).size !== items.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Representations must be unique.' });
    if (items.reduce((sum, item) => sum + item.weightBasisPoints, 0) !== 10_000)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Representation weights must total 10,000 basis points.',
      });
  });

const moveWeightsSchema = z
  .record(petrosMoveTypeSchema, weight)
  .superRefine((weights, ctx) => {
    for (const move of PETROS_MOVE_TYPES) {
      if (weights[move] == null)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [move],
          message: `A deterministic weight is required for ${move}.`,
        });
    }
  });

const prerequisiteListSchema = z
  .array(
    z
      .object({
        conceptKey: boundedText(160),
        label: boundedText(240),
        requiredness: z.enum(['helpful', 'strong', 'mandatory']),
        sourceReferences: z.array(sourceReferenceSchema).max(8),
      })
      .strict(),
  )
  .max(40);

const misconceptionListSchema = z
  .array(
    z
      .object({
        key: boundedText(160),
        summary: boundedText(600),
        correctionAnchor: boundedText(800),
        sourceReferences: z.array(sourceReferenceSchema).min(1).max(8),
      })
      .strict(),
  )
  .max(40);

const realWorldAnchorsSchema = z
  .object({
    availability: scale,
    quality: scale,
    examples: z.array(boundedText(500)).max(12),
  })
  .strict();

const profileMovesSchema = z
  .object({
    required: z.array(petrosMoveTypeSchema).max(PETROS_MOVE_TYPES.length),
    recommended: z.array(petrosMoveTypeSchema).max(PETROS_MOVE_TYPES.length),
    disallowed: z.array(petrosMoveTypeSchema).max(PETROS_MOVE_TYPES.length),
    weights: moveWeightsSchema,
    openingPattern: z.array(petrosMoveTypeSchema).min(1).max(5),
    practicePattern: z.array(petrosMoveTypeSchema).min(1).max(8),
    closingPattern: z.array(petrosMoveTypeSchema).min(1).max(4),
  })
  .strict();

/**
 * Scale documentation:
 * - abstractionLevel: 0 concrete, 1 mostly concrete, 2 mixed, 3 abstract, 4 highly abstract.
 * - prerequisiteDensity/misconceptionRichness/load/anchor availability/quality:
 *   0 none, 1 low, 2 moderate, 3 high, 4 defining/very high.
 * - all weights and confidence values use integer basis points (0..10,000).
 */
export const petrosTopicProfileDimensionsSchema = z
  .object({
    knowledgeTypes: weightedKnowledgeSchema,
    abstractionLevel: scale,
    representations: weightedRepresentationSchema,
    prerequisiteDensity: scale,
    prerequisites: prerequisiteListSchema,
    misconceptionRichness: scale,
    misconceptions: misconceptionListSchema,
    mathematicalLoad: scale,
    memorisationLoad: scale,
    realWorldAnchors: realWorldAnchorsSchema,
    moves: profileMovesSchema,
  })
  .strict()
  .superRefine((profile, ctx) => {
    const sets = [profile.moves.required, profile.moves.recommended, profile.moves.disallowed];
    for (const [index, items] of sets.entries()) {
      if (new Set(items).size !== items.length)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['moves', ['required', 'recommended', 'disallowed'][index]!],
          message: 'Move lists cannot contain duplicates.',
        });
    }
    const contradicted = [...profile.moves.required, ...profile.moves.recommended].filter((move) =>
      profile.moves.disallowed.includes(move),
    );
    if (contradicted.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['moves'],
        message: `Moves cannot be both allowed and disallowed: ${contradicted.join(', ')}.`,
      });
    if (profile.prerequisiteDensity >= 3 && profile.prerequisites.length === 0)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['prerequisites'],
        message: 'High prerequisite density requires explicit prerequisite links.',
      });
    if (profile.misconceptionRichness >= 3 && profile.misconceptions.length === 0)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['misconceptions'],
        message: 'High misconception richness requires sourced misconception references.',
      });
    if (profile.mathematicalLoad === 0 && profile.moves.required.includes('derivation'))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['moves', 'required'],
        message: 'Derivation cannot be required for non-mathematical material.',
      });
    if (
      profile.moves.disallowed.includes('prerequisite_check') &&
      profile.prerequisiteDensity >= 3
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['moves', 'disallowed'],
        message: 'High prerequisite density cannot disallow prerequisite checks.',
      });
    if (
      profile.moves.disallowed.includes('misconception_demolition') &&
      profile.misconceptionRichness >= 3
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['moves', 'disallowed'],
        message: 'Misconception-rich material cannot disallow misconception demolition.',
      });
  });
export type PetrosTopicProfileDimensions = z.infer<typeof petrosTopicProfileDimensionsSchema>;

export const petrosTopicProfileSchema = z
  .object({
    schemaVersion: z.literal(PETROS_TOPIC_PROFILE_SCHEMA_VERSION),
    identity: z
      .object({
        topicKey: boundedText(160),
        canonicalTitle: boundedText(240),
        subjectKey: boundedText(160),
        subjectLabel: boundedText(240),
        gradeBand: boundedText(120),
        curriculumKey: boundedText(160),
        curriculumLabel: boundedText(240),
        syllabusReferences: z.array(sourceReferenceSchema).max(20),
      })
      .strict(),
    dimensions: petrosTopicProfileDimensionsSchema,
    provenance: z
      .object({
        source: z.enum(['generated', 'human_authored', 'deterministic_seed']),
        confidenceBasisPoints: z.number().int().min(0).max(10_000),
        generatorVersion: boundedText(120),
        promptVersion: boundedText(120),
        sourceReferences: z.array(sourceReferenceSchema).max(20),
        reviewer: boundedText(240).nullable(),
        reviewedAt: z.string().datetime().nullable(),
      })
      .strict(),
    cache: z
      .object({
        key: boundedText(240),
        version: z.number().int().positive(),
        invalidationInputs: z
          .object({
            curriculumVersion: boundedText(120),
            syllabusVersion: boundedText(120),
            schemaVersion: z.literal(PETROS_TOPIC_PROFILE_SCHEMA_VERSION),
            promptVersion: boundedText(120),
            groundingHash: boundedText(128),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();
export type PetrosTopicProfile = z.infer<typeof petrosTopicProfileSchema>;

export const petrosTopicProfileOverridePatchSchema = z
  .object({
    dimensions: z
      .object({
        knowledgeTypes: weightedKnowledgeSchema.optional(),
        abstractionLevel: scale.optional(),
        representations: weightedRepresentationSchema.optional(),
        prerequisiteDensity: scale.optional(),
        prerequisites: prerequisiteListSchema.optional(),
        misconceptionRichness: scale.optional(),
        misconceptions: misconceptionListSchema.optional(),
        mathematicalLoad: scale.optional(),
        memorisationLoad: scale.optional(),
        realWorldAnchors: realWorldAnchorsSchema.optional(),
        moves: profileMovesSchema.optional(),
      })
      .strict(),
  })
  .strict();
export type PetrosTopicProfileOverridePatch = z.infer<
  typeof petrosTopicProfileOverridePatchSchema
>;

export const petrosResolvedTopicProfileSchema = z
  .object({
    profileId: z.string().uuid(),
    canonicalVersionId: z.string().uuid(),
    canonicalVersion: z.number().int().positive(),
    overrideId: z.string().uuid().nullable(),
    overrideVersion: z.number().int().positive().nullable(),
    resolvedForInstitutionId: z.string().uuid(),
    resolution: z.enum(['canonical', 'institution_override']),
    profile: petrosTopicProfileSchema,
    resolvedAt: z.string().datetime(),
  })
  .strict();
export type PetrosResolvedTopicProfile = z.infer<typeof petrosResolvedTopicProfileSchema>;

export const petrosTopicProfileListQuerySchema = z.object({
  search: z.string().trim().max(240).optional(),
  subject: z.string().trim().max(160).optional(),
  grade: z.string().trim().max(120).optional(),
  curriculum: z.string().trim().max(160).optional(),
  institutionId: z.string().uuid().optional(),
  status: z.enum(['draft', 'published', 'stale', 'archived']).optional(),
  stale: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type PetrosTopicProfileListQuery = z.infer<typeof petrosTopicProfileListQuerySchema>;

export const petrosGenerateTopicProfileSchema = z
  .object({
    topicKey: boundedText(160),
    canonicalTitle: boundedText(240),
    subjectKey: boundedText(160),
    subjectLabel: boundedText(240),
    gradeBand: boundedText(120),
    curriculumKey: boundedText(160),
    curriculumLabel: boundedText(240),
    curriculumVersion: boundedText(120),
    syllabusVersion: boundedText(120),
    syllabusReferences: z.array(sourceReferenceSchema).max(20).default([]),
    authoritativeGrounding: z.array(boundedText(2_000)).max(20).default([]),
    reason: boundedText(500),
    regenerate: z.boolean().default(false),
  })
  .strict();
export type PetrosGenerateTopicProfileInput = z.infer<
  typeof petrosGenerateTopicProfileSchema
>;

export const petrosUpdateTopicProfileSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    profile: petrosTopicProfileSchema,
    reason: boundedText(500),
  })
  .strict();
export type PetrosUpdateTopicProfileInput = z.infer<typeof petrosUpdateTopicProfileSchema>;

export const petrosPublishTopicProfileSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    reason: boundedText(500),
  })
  .strict();
export type PetrosPublishTopicProfileInput = z.infer<typeof petrosPublishTopicProfileSchema>;

export const petrosRollbackTopicProfileSchema = z
  .object({
    targetVersion: z.number().int().positive(),
    expectedVersion: z.number().int().positive(),
    reason: boundedText(500),
  })
  .strict();
export type PetrosRollbackTopicProfileInput = z.infer<typeof petrosRollbackTopicProfileSchema>;

export const petrosUpsertTopicProfileOverrideSchema = z
  .object({
    institutionId: z.string().uuid(),
    expectedVersion: z.number().int().nonnegative(),
    patch: petrosTopicProfileOverridePatchSchema,
    reason: boundedText(500),
  })
  .strict();
export type PetrosUpsertTopicProfileOverrideInput = z.infer<
  typeof petrosUpsertTopicProfileOverrideSchema
>;

export interface PetrosTopicProfileVersionDto {
  id: string;
  version: number;
  status: 'draft' | 'published' | 'superseded' | 'rolled_back';
  source: 'generated' | 'human_edit' | 'rollback';
  profile: PetrosTopicProfile;
  profileHash: string;
  changeSummary: string;
  generatedRequestId: string | null;
  createdBy: string | null;
  reviewedBy: string | null;
  createdAt: string;
  publishedAt: string | null;
}

export interface PetrosTopicProfileDto {
  id: string;
  learnTopicId: string | null;
  topicKey: string;
  canonicalTitle: string;
  subjectKey: string;
  subjectLabel: string;
  gradeBand: string;
  curriculumKey: string;
  curriculumLabel: string;
  status: 'draft' | 'published' | 'stale' | 'archived';
  cacheKey: string;
  cacheVersion: number;
  cacheHitCount: number;
  staleReason: string | null;
  version: number;
  publishedVersion: PetrosTopicProfileVersionDto | null;
  latestVersion: PetrosTopicProfileVersionDto | null;
  versions: PetrosTopicProfileVersionDto[];
  overrides: Array<{
    id: string;
    institutionId: string;
    version: number;
    status: 'draft' | 'published' | 'archived';
    patch: PetrosTopicProfileOverridePatch;
    basedOnCanonicalVersion: number;
    createdAt: string;
    publishedAt: string | null;
  }>;
  prerequisites: PetrosTopicProfileDimensions['prerequisites'];
  misconceptions: PetrosTopicProfileDimensions['misconceptions'];
  auditHistory: Array<{
    id: string;
    action: string;
    actorRef: string | null;
    reason: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}
