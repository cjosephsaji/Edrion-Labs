import { z } from 'zod';
import { PETROS_SESSION_TYPES } from './petros-learning';

export const PETROS_SESSION_INTENT_SCHEMA_VERSION = 'petros.session-intent.v1';
export const PETROS_SESSION_INTENT_DOORS = [
  'result_repair',
  'upcoming_exam',
  'uploaded_document',
  'learning_path',
  'assistant_handoff',
  'reflection_action',
  'active_homework',
] as const;
export const PETROS_EMOTIONAL_REGISTERS = [
  'flat_practical',
  'calm_focused',
  'curious_grounded',
  'progressive_supportive',
  'responsive_neutral',
] as const;
export const PETROS_INTENT_METRICS = [
  'impression',
  'start',
  'assistant_offered',
  'assistant_accepted',
  'completed',
  'paused',
  'abandoned',
  'artifact_saved',
  'returned',
  'failure',
] as const;

const shortText = z.string().trim().min(1).max(600);
const referenceId = z.string().trim().min(1).max(240);

export const petrosSessionIntentDoorSchema = z.enum(PETROS_SESSION_INTENT_DOORS);
export const petrosEmotionalRegisterSchema = z.enum(PETROS_EMOTIONAL_REGISTERS);
export const petrosIntentMetricSchema = z.enum(PETROS_INTENT_METRICS);

export const petrosSourceCitationSchema = z
  .object({
    sourceType: z.enum(['result', 'exam', 'document', 'learning_path', 'portal_screen', 'reflection', 'assignment']),
    sourceId: referenceId,
    topicId: z.string().trim().min(1).max(160).optional(),
    version: z.string().trim().min(1).max(120),
    label: shortText,
    page: z.number().int().positive().nullable(),
    section: z.string().trim().min(1).max(300).nullable(),
    excerpt: z.string().trim().min(1).max(1_200).nullable(),
  })
  .strict();

export const petrosReturnDestinationSchema = z
  .object({
    href: z.string().trim().startsWith('/').max(500),
    label: z.string().trim().min(1).max(120),
    resumeToken: z.string().uuid(),
  })
  .strict();

export const PETROS_TEACHING_PRIORITIES = [
  'exam_prep',
  'understand',
  'revisit_weak_topic',
  'quick_review',
] as const;
export const petrosTeachingPrioritySchema = z.enum(PETROS_TEACHING_PRIORITIES);
export type PetrosTeachingPriority = z.infer<typeof petrosTeachingPrioritySchema>;

export const petrosLessonTopicSchema = z.object({
  id: z.string().trim().min(1).max(160),
  title: shortText,
  summary: z.string().trim().max(600),
  pageStart: z.number().int().positive().nullable(),
  pageEnd: z.number().int().positive().nullable(),
  estimatedMinutes: z.number().int().min(5).max(120),
  keyTerms: z.array(z.string().trim().min(1).max(80)).max(12),
  likelyDoubts: z.array(shortText).max(5),
  prerequisites: z.array(shortText).max(6).optional(),
  difficulty: z.enum(['foundation', 'intermediate', 'advanced']).optional(),
}).strict();

export const petrosTeachingPlanningSchema = z.object({
  organization: z.enum(['concepts', 'headings']).optional(),
  topics: z.array(petrosLessonTopicSchema).min(1).max(80),
  suggestedTopicId: z.string().trim().min(1).max(160),
  suggestedPriority: petrosTeachingPrioritySchema,
  deadline: z.object({
    kind: z.enum(['exam', 'assignment', 'teacher_schedule']),
    title: shortText,
    at: z.string().datetime(),
    source: z.literal('teacher_schedule'),
  }).strict().nullable(),
  outlineCacheKey: z.string().trim().min(1).max(240).nullable(),
  outlineStatus: z.enum(['cached', 'generated', 'not_applicable']),
  estimatedTotalMinutes: z.number().int().min(5).max(10_800),
}).strict();
export type PetrosTeachingPlanning = z.infer<typeof petrosTeachingPlanningSchema>;

export const petrosTeachingPlanSelectionSchema = z.object({
  topicId: z.string().trim().min(1).max(160),
  priority: petrosTeachingPrioritySchema,
  timeBudgetSeconds: z.number().int().min(300).max(2_400),
  existingDoubt: z.string().trim().max(2_000).nullable().default(null),
}).strict();
export type PetrosTeachingPlanSelection = z.infer<typeof petrosTeachingPlanSelectionSchema>;

export const petrosSessionIntentSchema = z
  .object({
    schemaVersion: z.literal(PETROS_SESSION_INTENT_SCHEMA_VERSION),
    id: z.string().uuid(),
    door: petrosSessionIntentDoorSchema,
    institutionId: z.string().uuid(),
    campusId: z.string().uuid().nullable(),
    studentId: z.string().uuid(),
    permissionContext: z.array(z.string().trim().min(1).max(160)).max(20),
    sessionType: z.enum(PETROS_SESSION_TYPES),
    goal: shortText,
    targetConcepts: z.array(shortText).min(1).max(12),
    scope: z
      .object({
        summary: shortText,
        boundaries: z.array(shortText).min(1).max(12),
        curriculum: z.array(shortText).max(12),
        knownFailureDetails: z.array(shortText).max(12),
        learningPathPosition: z
          .object({
            pathId: z.string().uuid(),
            itemId: z.string().uuid(),
            sequence: z.number().int().positive(),
            prerequisites: z.array(shortText).max(12),
          })
          .strict()
          .nullable(),
      })
      .strict(),
    time: z
      .object({
        budgetSeconds: z.number().int().min(300).max(2_400),
        deadline: z.string().datetime().nullable(),
        examDate: z.string().datetime().nullable(),
      })
      .strict(),
    emotionalRegister: petrosEmotionalRegisterSchema,
    registerFactors: z.array(shortText).min(1).max(8),
    sourceEntityIds: z.array(referenceId).min(1).max(12),
    // A persistent document map can expose up to 80 bounded concepts. Keeping
    // the old 24-citation cap made valid 16-page guides fail while resolving
    // the preview, before preparation could even begin.
    citations: z.array(petrosSourceCitationSchema).max(80),
    language: z.string().trim().min(2).max(40),
    accessibility: z.array(z.string().trim().min(1).max(120)).max(12),
    returnDestination: petrosReturnDestinationSchema,
    policyDisclosures: z.array(shortText).min(1).max(12),
    planning: petrosTeachingPlanningSchema.nullable().default(null),
    homeworkContext: z
      .object({
        assignmentId: z.string().uuid(),
        classId: z.string().uuid(),
        subjectId: z.string().uuid().nullable(),
        status: z.enum(['assigned', 'submitted', 'late', 'extended', 'graded', 'missing']),
        opensAt: z.string().datetime(),
        dueAt: z.string().datetime(),
        deadlineDate: z.string().date().nullable(),
        extendedUntil: z.string().datetime().nullable(),
        teacherOverride: z.enum(['inherit', 'allow_solution', 'force_guidance']),
        relationBasisPoints: z.number().int().min(0).max(10_000),
      })
      .strict()
      .nullable()
      .default(null),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    idempotencyKey: z.string().uuid(),
    correlationId: z.string().uuid(),
    status: z.enum(['resolved', 'started', 'expired', 'invalidated']),
    expiresAt: z.string().datetime(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type PetrosSessionIntent = z.infer<typeof petrosSessionIntentSchema>;

export const resolvePetrosSessionIntentSchema = z
  .object({
    door: petrosSessionIntentDoorSchema,
    sourceId: referenceId,
    idempotencyKey: z.string().uuid(),
    timeBudgetSeconds: z.number().int().min(300).max(2_400).default(900),
    page: z.number().int().positive().optional(),
    section: z.string().trim().min(1).max(300).optional(),
    question: z.string().trim().min(2).max(2_000).optional(),
    route: z.string().trim().startsWith('/').max(500).optional(),
    language: z.string().trim().min(2).max(40).default('en'),
    accessibility: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.door === 'assistant_handoff' && !value.question) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['question'],
        message: 'A question is required for an assistant handoff.',
      });
    }
  });
export type ResolvePetrosSessionIntentInput = z.infer<typeof resolvePetrosSessionIntentSchema>;

export const startPetrosSessionIntentSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    plan: petrosTeachingPlanSelectionSchema.optional(),
  })
  .strict();
export type StartPetrosSessionIntentInput = z.infer<typeof startPetrosSessionIntentSchema>;

export const petrosAssistantQuestionSchema = z
  .object({
    question: z.string().trim().min(2).max(2_000),
    route: z.string().trim().startsWith('/').max(500),
    sourceId: referenceId.optional(),
    selectedCard: z
      .object({
        title: z.string().trim().min(1).max(240),
        description: z.string().trim().min(1).max(1_000),
        href: z.string().trim().startsWith('/').max(500).optional(),
      })
      .strict()
      .optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type PetrosAssistantQuestionInput = z.infer<typeof petrosAssistantQuestionSchema>;

export const petrosAssistantAnswerSchema = z
  .object({
    mode: z.enum(['quick_answer', 'session_offer']),
    answer: z.string().trim().min(1).max(2_500),
    contextLabel: shortText,
    offer: z
      .object({
        description: shortText,
        approximateMinutes: z.number().int().positive(),
        sourceId: referenceId,
      })
      .strict()
      .nullable(),
  })
  .strict();
export type PetrosAssistantAnswer = z.infer<typeof petrosAssistantAnswerSchema>;

export const petrosIntentMetricInputSchema = z
  .object({
    event: petrosIntentMetricSchema,
    idempotencyKey: z.string().uuid(),
    sessionId: z.string().uuid().optional(),
    reasonCode: z.string().trim().min(2).max(120).optional(),
  })
  .strict();
export type PetrosIntentMetricInput = z.infer<typeof petrosIntentMetricInputSchema>;

export const petrosDoorsDashboardQuerySchema = z.object({
  institutionId: z.string().uuid().optional(),
  door: petrosSessionIntentDoorSchema.optional(),
  sessionType: z.enum(PETROS_SESSION_TYPES).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type PetrosDoorsDashboardQuery = z.infer<typeof petrosDoorsDashboardQuerySchema>;
