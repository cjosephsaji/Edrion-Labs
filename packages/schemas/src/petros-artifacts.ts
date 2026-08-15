import { z } from 'zod';

export const PETROS_ARTIFACT_SCHEMA_VERSION = 'petros.artifact.stage7.v1' as const;
export const PETROS_ARTIFACT_PROPOSAL_VERSION = 'petros.artifact-proposal.stage7.v1' as const;
export const PETROS_ARTIFACT_PROMPT_VERSION = 'petros.artifact.proposal.stage7.v1' as const;
export const PETROS_ARTIFACT_FUNCTION_KEYS = {
  flashcard: 'artifact.flashcards.generate',
  rule_card: 'artifact.flashcards.generate',
  note: 'artifact.notes.generate',
  diagram: 'artifact.diagram.generate',
} as const;
export const PETROS_REVIEW_SCHEDULER_VERSION = 'petros.review.exam-aware.v1' as const;

export const petrosArtifactKindSchema = z.enum(['flashcard', 'rule_card', 'diagram', 'note']);
export type PetrosArtifactKind = z.infer<typeof petrosArtifactKindSchema>;

export const petrosArtifactSourceSchema = z
  .object({
    kind: z.enum(['session_block', 'document_page', 'assessment']),
    sessionId: z.string().uuid(),
    blockId: z.string().uuid().nullable().default(null),
    knowledgeItemId: z.string().uuid().nullable().default(null),
    pageIndex: z.number().int().min(0).max(100_000).nullable().default(null),
    assessmentId: z.string().uuid().nullable().default(null),
    label: z.string().trim().min(1).max(240),
    excerpt: z.string().trim().max(500).nullable().default(null),
    institutionRestricted: z.boolean().default(false),
  })
  .strict()
  .superRefine((source, ctx) => {
    if (source.kind === 'document_page' && (!source.knowledgeItemId || source.pageIndex == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['knowledgeItemId'],
        message: 'A document-page source needs a knowledge item and page index.',
      });
    }
    if (source.kind === 'assessment' && !source.assessmentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assessmentId'],
        message: 'An assessment source needs an assessment id.',
      });
    }
  });
export type PetrosArtifactSource = z.infer<typeof petrosArtifactSourceSchema>;

const artifactBase = {
  title: z.string().trim().min(1).max(200),
  tags: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
};

export const petrosFlashcardContentSchema = z
  .object({
    kind: z.enum(['flashcard', 'rule_card']),
    ...artifactBase,
    front: z.string().trim().min(1).max(2_000),
    back: z.string().trim().min(1).max(4_000),
    hint: z.string().trim().max(1_000).nullable().default(null),
    explanation: z.string().trim().max(2_000).nullable().default(null),
  })
  .strict();

export const petrosNoteContentSchema = z
  .object({
    kind: z.literal('note'),
    ...artifactBase,
    body: z.string().trim().min(1).max(16_000),
  })
  .strict();

const diagramNodeSchema = z
  .object({
    id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
    label: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1_000).default(''),
  })
  .strict();

const diagramEdgeSchema = z
  .object({
    id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
    from: z.string().min(1).max(64),
    to: z.string().min(1).max(64),
    label: z.string().trim().max(120).default('connects to'),
  })
  .strict();

export const petrosDiagramContentSchema = z
  .object({
    kind: z.literal('diagram'),
    ...artifactBase,
    archetype: z.enum(['mind_map', 'flowchart', 'cycle', 'timeline', 'hierarchy', 'comparison']),
    nodes: z.array(diagramNodeSchema).min(2).max(40),
    edges: z.array(diagramEdgeSchema).max(80),
    accessibleDescription: z.string().trim().min(12).max(4_000),
  })
  .strict()
  .superRefine((diagram, ctx) => {
    const nodeIds = new Set(diagram.nodes.map((node) => node.id));
    if (nodeIds.size !== diagram.nodes.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes'], message: 'Node ids must be unique.' });
    }
    const edgeIds = new Set<string>();
    diagram.edges.forEach((edge, index) => {
      if (edgeIds.has(edge.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['edges', index, 'id'], message: 'Edge ids must be unique.' });
      }
      edgeIds.add(edge.id);
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to) || edge.from === edge.to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges', index],
          message: 'Edges must connect two different nodes in this diagram.',
        });
      }
    });
  });

export const petrosArtifactContentSchema = z.union([
  petrosFlashcardContentSchema,
  petrosNoteContentSchema,
  petrosDiagramContentSchema,
]);
export type PetrosArtifactContent = z.infer<typeof petrosArtifactContentSchema>;

export const petrosArtifactProposalSchema = z
  .object({
    schemaVersion: z.literal(PETROS_ARTIFACT_PROPOSAL_VERSION),
    id: z.string().uuid(),
    bundleId: z.string().uuid(),
    kind: petrosArtifactKindSchema,
    state: z.enum(['proposed', 'edited', 'saved', 'discarded', 'failed']),
    selected: z.boolean(),
    content: petrosArtifactContentSchema,
    originalContent: petrosArtifactContentSchema,
    sources: z.array(petrosArtifactSourceSchema).max(12),
    version: z.number().int().nonnegative(),
    savedArtifactId: z.string().uuid().nullable(),
    failureCode: z.string().max(120).nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type PetrosArtifactProposal = z.infer<typeof petrosArtifactProposalSchema>;

export const petrosArtifactBundleSchema = z
  .object({
    schemaVersion: z.literal(PETROS_ARTIFACT_SCHEMA_VERSION),
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    state: z.enum(['open', 'partially_saved', 'saved', 'discarded']),
    version: z.number().int().nonnegative(),
    proposals: z.array(petrosArtifactProposalSchema).max(24),
    counts: z.object({ proposed: z.number().int().nonnegative(), saved: z.number().int().nonnegative(), failed: z.number().int().nonnegative() }).strict(),
    forwardLink: z.string().trim().max(700).nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type PetrosArtifactBundle = z.infer<typeof petrosArtifactBundleSchema>;

export const petrosUpdateArtifactProposalSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    selected: z.boolean(),
    content: petrosArtifactContentSchema,
  })
  .strict();
export type PetrosUpdateArtifactProposalInput = z.infer<typeof petrosUpdateArtifactProposalSchema>;

export const petrosCommitArtifactBundleSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    expectedBundleVersion: z.number().int().nonnegative(),
    proposalIds: z.array(z.string().uuid()).min(1).max(24),
  })
  .strict();
export type PetrosCommitArtifactBundleInput = z.infer<typeof petrosCommitArtifactBundleSchema>;

export const petrosArtifactCommitResultSchema = z
  .object({
    bundle: petrosArtifactBundleSchema,
    results: z.array(
      z.object({
        proposalId: z.string().uuid(),
        status: z.enum(['saved', 'already_saved', 'failed']),
        artifactId: z.string().uuid().nullable(),
        errorCode: z.string().max(120).nullable(),
        recovery: z.string().max(500).nullable(),
      }).strict(),
    ),
  })
  .strict();
export type PetrosArtifactCommitResult = z.infer<typeof petrosArtifactCommitResultSchema>;

export const petrosSavedArtifactSchema = z
  .object({
    schemaVersion: z.literal(PETROS_ARTIFACT_SCHEMA_VERSION),
    id: z.string().uuid(),
    portableId: z.string().uuid(),
    kind: petrosArtifactKindSchema,
    lifecycle: z.enum(['saved', 'archived', 'deleted']),
    content: petrosArtifactContentSchema,
    sources: z.array(petrosArtifactSourceSchema).max(12),
    revision: z.number().int().positive(),
    productTargetId: z.string().uuid(),
    dueAt: z.string().datetime().nullable(),
    schedulerVersion: z.string().nullable(),
    examAware: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type PetrosSavedArtifact = z.infer<typeof petrosSavedArtifactSchema>;

export const petrosArtifactQuerySchema = z.object({
  kind: petrosArtifactKindSchema.optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type PetrosArtifactQuery = z.infer<typeof petrosArtifactQuerySchema>;

export const petrosUpdateSavedArtifactSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    content: petrosArtifactContentSchema,
  })
  .strict();
export type PetrosUpdateSavedArtifactInput = z.infer<typeof petrosUpdateSavedArtifactSchema>;

export const petrosArtifactLifecycleSchema = z
  .object({ action: z.enum(['pause_reviews', 'resume_reviews', 'archive', 'restore']) })
  .strict();
export type PetrosArtifactLifecycleInput = z.infer<typeof petrosArtifactLifecycleSchema>;

export const petrosReviewGradeSchema = z.enum(['again', 'hard', 'good', 'easy']);
export const petrosReviewConfidenceSchema = z.enum(['sure', 'think_so', 'guessing']);

export const petrosSubmitArtifactReviewSchema = z
  .object({
    clientReviewId: z.string().uuid(),
    grade: petrosReviewGradeSchema,
    confidence: petrosReviewConfidenceSchema,
    reviewedAt: z.string().datetime(),
    elapsedMs: z.number().int().min(0).max(3_600_000).nullable().default(null),
    timezone: z.string().trim().min(1).max(80),
  })
  .strict();
export type PetrosSubmitArtifactReviewInput = z.infer<typeof petrosSubmitArtifactReviewSchema>;

export const petrosDueReviewCardSchema = z
  .object({
    artifact: petrosSavedArtifactSchema,
    deckId: z.string().uuid(),
    topic: z.string().max(200),
    dueAt: z.string().datetime(),
    schedulerVersion: z.string(),
    examDate: z.string().date().nullable(),
    scheduleExplanation: z.string().max(500),
  })
  .strict();
export type PetrosDueReviewCard = z.infer<typeof petrosDueReviewCardSchema>;

export const petrosReviewQueueSchema = z
  .object({
    cards: z.array(petrosDueReviewCardSchema),
    mixingExplanation: z.string().max(500),
    generatedAt: z.string().datetime(),
  })
  .strict();
export type PetrosReviewQueue = z.infer<typeof petrosReviewQueueSchema>;

export const petrosArtifactDashboardQuerySchema = z.object({
  institutionId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type PetrosArtifactDashboardQuery = z.infer<typeof petrosArtifactDashboardQuerySchema>;
