import { z } from 'zod';

export const PETROS_DOCUMENT_LEARNING_VERSION = 'petros.document-learning.v1' as const;

export const petrosDocumentSubjectSchema = z.enum([
  'mathematics',
  'physics',
  'chemistry',
  'biology',
  'economics',
  'computing',
  'humanities',
  'language',
  'mixed',
]);
export type PetrosDocumentSubject = z.infer<typeof petrosDocumentSubjectSchema>;

export const petrosDocumentPreparationStageSchema = z.enum([
  'queued',
  'checking_source',
  'mapping_document',
  'selecting_start',
  'generating_lesson',
  'repairing_lesson',
  'validating_lesson',
  'first_lesson_ready',
  'preparing_next',
  'complete',
  'needs_attention',
  'cancelled',
]);

export const petrosDocumentSourceRegionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  page: z.number().int().positive(),
  order: z.number().int().nonnegative(),
  kind: z.enum(['heading', 'paragraph', 'equation', 'table', 'figure', 'caption', 'list', 'unresolved']),
  text: z.string().max(20_000),
  level: z.number().int().min(1).max(6).optional(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  confidence: z.number().min(0).max(1),
  warning: z.string().trim().max(500).optional(),
}).strict();

export const petrosDocumentSourceStructureSchema = z.object({
  parserVersion: z.string().trim().min(1).max(80),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  pages: z.array(z.object({
    page: z.number().int().positive(),
    width: z.number().positive().nullable(),
    height: z.number().positive().nullable(),
    regions: z.array(petrosDocumentSourceRegionSchema),
    confidence: z.number().min(0).max(1),
    warnings: z.array(z.string().trim().max(500)).max(20),
  }).strict()).min(1).max(2_000),
  warnings: z.array(z.string().trim().max(500)).max(100),
  extractionComplete: z.boolean(),
}).strict();
export type PetrosDocumentSourceStructure = z.infer<typeof petrosDocumentSourceStructureSchema>;

export const petrosDocumentConceptSchema = z.object({
  id: z.string().trim().min(1).max(100),
  title: z.string().trim().min(3).max(240),
  summary: z.string().trim().min(10).max(1_000),
  subject: petrosDocumentSubjectSchema,
  objectives: z.array(z.string().trim().min(3).max(300)).min(1).max(12),
  prerequisites: z.array(z.string().trim().min(2).max(240)).max(12),
  sourceRegionIds: z.array(z.string().trim().min(1).max(120)).min(1).max(200),
  sourcePages: z.array(z.number().int().positive()).min(1).max(200),
  estimatedMinutes: z.number().int().min(5).max(180),
  classification: z.enum(['concept', 'worked_example', 'exercise', 'reference', 'duplicate', 'noninstructional', 'unresolved']),
  preparationStatus: z.enum(['mapped', 'preparing', 'ready', 'needs_attention']),
}).strict();

export const petrosDocumentMapSchema = z.object({
  version: z.literal(PETROS_DOCUMENT_LEARNING_VERSION),
  sourceRevisionId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  provisional: z.boolean(),
  subject: petrosDocumentSubjectSchema,
  concepts: z.array(petrosDocumentConceptSchema).min(1).max(500),
  recommendedConceptId: z.string().trim().min(1).max(100),
  mappedRegionIds: z.array(z.string().trim().min(1).max(120)).max(10_000),
  unresolvedRegionIds: z.array(z.string().trim().min(1).max(120)).max(10_000),
  generatedAt: z.string().datetime(),
}).strict();
export type PetrosDocumentMap = z.infer<typeof petrosDocumentMapSchema>;

export const petrosDocumentPreparationSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['queued', 'preparing', 'ready', 'needs_attention', 'cancelled']),
  stage: petrosDocumentPreparationStageSchema,
  progress: z.number().int().min(0).max(100),
  message: z.string().trim().min(1).max(500),
  pathId: z.string().uuid().nullable(),
  firstLessonId: z.string().uuid().nullable(),
  recommendedConceptId: z.string().trim().max(100).nullable(),
  retryable: z.boolean(),
  issueCode: z.string().trim().max(100).nullable(),
  updatedAt: z.string().datetime(),
}).strict();
export type PetrosDocumentPreparation = z.infer<typeof petrosDocumentPreparationSchema>;

export const preparePetrosDocumentSchema = z.object({
  idempotencyKey: z.string().uuid(),
  topicId: z.string().trim().min(1).max(100).optional(),
  timeBudgetSeconds: z.number().int().min(300).max(7_200),
  priority: z.enum(['exam_prep', 'understand', 'revisit_weak_topic', 'quick_review']).default('understand'),
  existingDoubt: z.string().trim().max(2_000).nullable().optional(),
}).strict();
export type PreparePetrosDocumentInput = z.infer<typeof preparePetrosDocumentSchema>;

export const petrosDocumentPathSchema = z.object({
  id: z.string().uuid(),
  sourceRevisionId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  currentConceptId: z.string().trim().max(100).nullable(),
  concepts: z.array(petrosDocumentConceptSchema.extend({
    lessonId: z.string().uuid().nullable(),
    learnerStatus: z.enum(['locked', 'available', 'in_progress', 'complete', 'review']),
    evidence: z.enum(['none', 'supported', 'independent', 'needs_review']),
  })).max(500),
  completedConcepts: z.number().int().nonnegative(),
  totalConcepts: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
}).strict();
export type PetrosDocumentPath = z.infer<typeof petrosDocumentPathSchema>;
