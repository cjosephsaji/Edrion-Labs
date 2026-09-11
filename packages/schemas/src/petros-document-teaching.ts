import { z } from 'zod';
import { petrosTeachingPresentationSchema } from './petros-presentation';

export const PETROS_DOCUMENT_TEACHING_EXPERIENCE =
  'document-teaching-v1' as const;
export const PETROS_DOCUMENT_TEACHING_SCHEMA_VERSION =
  'petros.document-teaching.v1' as const;
export const PETROS_DOCUMENT_TEACHING_SCHEMA_VERSION_V2 =
  'petros.document-teaching.v2' as const;
export const PETROS_DOCUMENT_TEACHING_SCHEMA_VERSION_V3 =
  'petros.document-teaching.v3' as const;
export const PETROS_DOCUMENT_TEACHING_SCHEMA_VERSION_V4 =
  'petros.document-teaching.v4' as const;

export const petrosDocumentScenePurposeSchema = z.enum([
  'teaching',
  'exploration',
  'guided_practice',
  'independent_check',
  'connection_review',
]);
export type PetrosDocumentScenePurpose = z.infer<
  typeof petrosDocumentScenePurposeSchema
>;

export const petrosDocumentRichTextSchema = z
  .array(
    z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('text'), value: z.string().max(1_600) }).strict(),
      z.object({
        kind: z.literal('math'),
        tex: z.string().trim().min(1).max(500),
        display: z.boolean().default(false),
        spoken: z.string().trim().min(1).max(500),
      }).strict(),
    ]),
  )
  .min(1)
  .max(30);

export const petrosDocumentResponseSpecSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('choice') }).strict(),
  z.object({ kind: z.literal('explanation'), placeholder: z.string().trim().max(240).optional() }).strict(),
  z.object({ kind: z.literal('numeric'), unit: z.string().trim().max(40).nullable().default(null) }).strict(),
  z.object({ kind: z.literal('expression'), variables: z.array(z.string().trim().min(1).max(20)).max(4).default([]) }).strict(),
  z.object({ kind: z.literal('ordering') }).strict(),
  z.object({ kind: z.literal('classification') }).strict(),
  z.object({ kind: z.literal('missing_step'), lineId: z.string().trim().min(1).max(60) }).strict(),
]);
export type PetrosDocumentResponseSpec = z.infer<typeof petrosDocumentResponseSpecSchema>;

export const petrosInstructionalPhaseSchema = z.enum([
  'concrete_opening',
  'visual_explanation',
  'guided_application',
  'independent_check',
  'feedback_transfer',
]);

export const petrosDocumentTeachingActivitySchema = z.enum([
  'annotated_text',
  'comparison',
  'classification',
  'sequence',
  'worked_steps',
  'numeric_exploration',
  'concept_map',
  'scenario',
  'coordinate_graph',
  'equation_steps',
  'process_diagram',
  'timeline_evidence',
  'code_trace',
]);
export type PetrosDocumentTeachingActivity = z.infer<
  typeof petrosDocumentTeachingActivitySchema
>;

const shortLabelSchema = z.string().trim().min(1).max(120);
const visualNodeSchema = z.object({
  id: z.string().trim().min(1).max(60),
  label: shortLabelSchema,
  detail: z.string().trim().max(240).optional(),
  group: z.string().trim().max(60).optional(),
}).strict();
const visualEdgeSchema = z.object({
  from: z.string().trim().min(1).max(60),
  to: z.string().trim().min(1).max(60),
  label: z.string().trim().max(80).optional(),
}).strict();
const numericOperandSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('input') }).strict(),
  z.object({ source: z.literal('constant'), value: z.number() }).strict(),
]);
const numericStepSchema = z.object({
  operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
  operand: numericOperandSchema,
}).strict();

const polynomialSchema = z.object({
  coefficients: z.array(z.number().finite()).min(1).max(6),
  label: shortLabelSchema,
  color: z.enum(['ink', 'green', 'gold', 'coral', 'blue']).default('green'),
}).strict();

export const petrosDocumentActivitySpecSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('annotated_text'),
    passage: z.string().trim().min(10).max(1_200),
    annotations: z.array(z.object({ phrase: shortLabelSchema, note: z.string().trim().min(3).max(240) }).strict()).min(1).max(6),
  }).strict(),
  z.object({
    kind: z.literal('comparison'),
    columns: z.array(shortLabelSchema).min(2).max(4),
    rows: z.array(z.object({ label: shortLabelSchema, values: z.array(z.string().trim().min(1).max(180)).min(2).max(4) }).strict()).min(1).max(8),
  }).strict(),
  z.object({
    kind: z.literal('classification'),
    categories: z.array(z.object({ id: z.string().trim().min(1).max(60), label: shortLabelSchema }).strict()).min(2).max(5),
    // categoryId is accepted only for legacy/private plans. Public v3 plans
    // strip it so the browser cannot receive the answer key.
    items: z.array(z.object({ id: z.string().trim().min(1).max(60), label: shortLabelSchema, categoryId: z.string().trim().min(1).max(60).optional() }).strict()).min(2).max(10),
  }).strict(),
  z.object({
    kind: z.literal('sequence'),
    steps: z.array(z.object({ id: z.string().trim().min(1).max(60), label: shortLabelSchema, detail: z.string().trim().max(240).optional() }).strict()).min(2).max(8),
  }).strict(),
  z.object({
    kind: z.literal('worked_steps'),
    steps: z.array(z.object({ label: shortLabelSchema, detail: z.string().trim().min(3).max(300) }).strict()).min(2).max(8),
  }).strict(),
  z.object({
    kind: z.literal('numeric_exploration'),
    variable: z.object({ label: shortLabelSchema, min: z.number(), max: z.number(), step: z.number().positive(), initial: z.number(), unit: z.string().trim().max(24) }).strict(),
    outputs: z.array(z.object({ label: shortLabelSchema, unit: z.string().trim().max(24), initial: z.number(), steps: z.array(numericStepSchema).min(1).max(6) }).strict()).min(1).max(4),
  }).strict(),
  z.object({
    kind: z.literal('concept_map'),
    layout: z.enum(['flow', 'cycle', 'timeline', 'comparison']),
    nodes: z.array(visualNodeSchema).min(2).max(10),
    edges: z.array(visualEdgeSchema).min(1).max(16),
    annotations: z.array(z.string().trim().min(1).max(160)).max(5),
  }).strict(),
  z.object({
    kind: z.literal('scenario'),
    setting: z.string().trim().min(10).max(700),
    evidence: z.array(z.string().trim().min(3).max(240)).min(1).max(6),
    focus: z.string().trim().min(3).max(240),
  }).strict(),
  z.object({
    kind: z.literal('coordinate_graph'),
    xAxis: z.object({ label: shortLabelSchema, min: z.number().finite(), max: z.number().finite(), unit: z.string().trim().max(24).default('') }).strict(),
    yAxis: z.object({ label: shortLabelSchema, min: z.number().finite(), max: z.number().finite(), unit: z.string().trim().max(24).default('') }).strict(),
    functions: z.array(polynomialSchema).min(1).max(3),
    verticalShift: z.object({
      functionIndex: z.number().int().nonnegative(),
      label: shortLabelSchema,
      min: z.number().finite(),
      max: z.number().finite(),
      step: z.number().positive(),
      initial: z.number().finite(),
      unchangedFunctionIndex: z.number().int().nonnegative().optional(),
    }).strict().optional(),
    area: z.object({
      functionIndex: z.number().int().nonnegative(),
      lower: z.number().finite(),
      upper: z.number().finite(),
      partitions: z.object({ min: z.number().int().min(1), max: z.number().int().max(200), initial: z.number().int().min(1) }).strict(),
      sampling: z.enum(['left', 'right', 'midpoint']),
      signed: z.boolean(),
    }).strict().optional(),
    annotations: z.array(z.object({ id: z.string().trim().min(1).max(60), x: z.number().finite(), y: z.number().finite(), label: z.string().trim().min(1).max(180) }).strict()).max(8),
    predictionPrompt: z.string().trim().min(8).max(360).optional(),
    accessibleSummary: z.string().trim().min(10).max(1_000),
  }).strict(),
  z.object({
    kind: z.literal('equation_steps'),
    lines: z.array(z.object({
      id: z.string().trim().min(1).max(60),
      expression: z.string().trim().min(1).max(360),
      explanation: z.string().trim().min(3).max(360),
      highlight: z.array(z.string().trim().min(1).max(80)).max(6),
      support: z.enum(['shown', 'faded', 'student']).default('shown'),
    }).strict()).min(2).max(10),
    correspondence: z.array(z.object({ fromLineId: z.string().trim().min(1).max(60), toLineId: z.string().trim().min(1).max(60), label: z.string().trim().min(1).max(160) }).strict()).max(10),
    accessibleSummary: z.string().trim().min(10).max(1_000),
  }).strict(),
  z.object({
    kind: z.literal('process_diagram'),
    orientation: z.enum(['horizontal', 'vertical', 'cycle']),
    nodes: z.array(visualNodeSchema).min(2).max(12),
    edges: z.array(visualEdgeSchema).min(1).max(20),
    revealOrder: z.array(z.string().trim().min(1).max(60)).min(2).max(20),
    relationship: z.enum(['causal', 'sequence', 'association', 'flow']),
    accessibleSummary: z.string().trim().min(10).max(1_000),
  }).strict(),
  z.object({
    kind: z.literal('timeline_evidence'),
    events: z.array(z.object({ id: z.string().trim().min(1).max(60), label: shortLabelSchema, dateLabel: z.string().trim().min(1).max(80), evidence: z.string().trim().min(3).max(360) }).strict()).min(2).max(12),
    question: z.string().trim().min(8).max(360),
    accessibleSummary: z.string().trim().min(10).max(1_000),
  }).strict(),
  z.object({
    kind: z.literal('code_trace'),
    language: z.string().trim().min(1).max(40),
    code: z.array(z.string().max(300)).min(1).max(30),
    frames: z.array(z.object({ id: z.string().trim().min(1).max(60), line: z.number().int().positive(), variables: z.record(z.string().max(120)), output: z.string().max(240).optional() }).strict()).min(2).max(30),
    predictionPrompt: z.string().trim().min(8).max(360),
    accessibleSummary: z.string().trim().min(10).max(1_000),
  }).strict(),
]);
export type PetrosDocumentActivitySpec = z.infer<typeof petrosDocumentActivitySpecSchema>;

const sourceRefSchema = z
  .object({
    page: z.number().int().positive(),
    quote: z.string().trim().max(360).optional(),
  })
  .strict();

const choiceSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(240),
  })
  .strict();

export const petrosDocumentTeachingSceneSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    title: z.string().trim().min(3).max(180),
    concept: z.string().trim().min(3).max(180),
    introduction: z.string().trim().min(10).max(900),
    explanation: z.string().trim().min(10).max(1_600),
    question: z.string().trim().min(8).max(900),
    activity: petrosDocumentTeachingActivitySchema,
    activitySpec: petrosDocumentActivitySpecSchema.optional(),
    phase: petrosInstructionalPhaseSchema.optional(),
    purpose: petrosDocumentScenePurposeSchema.optional(),
    content: petrosDocumentRichTextSchema.optional(),
    response: petrosDocumentResponseSpecSchema.optional(),
    taskId: z.string().trim().min(1).max(100).optional(),
    objectiveId: z.string().trim().min(1).max(100).optional(),
    petrosAnchorId: z.string().trim().min(1).max(80).optional(),
    supplemental: z.boolean().default(false),
    responseType: z.enum(['choice', 'explanation']),
    choices: z.array(choiceSchema).max(6),
    hint: z.string().trim().min(8).max(700),
    example: z.string().trim().min(8).max(1_000),
    sourceRefs: z.array(sourceRefSchema).min(1).max(8),
    target: z.enum(['left', 'center', 'right']),
    presentation: petrosTeachingPresentationSchema.optional(),
  })
  .strict();
export type PetrosDocumentTeachingScene = z.infer<
  typeof petrosDocumentTeachingSceneSchema
>;

export const petrosDocumentTeachingPlanSchema = z
  .object({
    schemaVersion: z.union([
      z.literal(PETROS_DOCUMENT_TEACHING_SCHEMA_VERSION),
      z.literal(PETROS_DOCUMENT_TEACHING_SCHEMA_VERSION_V2),
      z.literal(PETROS_DOCUMENT_TEACHING_SCHEMA_VERSION_V3),
      z.literal(PETROS_DOCUMENT_TEACHING_SCHEMA_VERSION_V4),
    ]),
    experience: z.literal(PETROS_DOCUMENT_TEACHING_EXPERIENCE),
    generatorVersion: z.string().trim().min(1).max(80),
    documentId: z.string().uuid(),
    documentVersion: z.number().int().nonnegative(),
    sourceFingerprint: z.string().min(32).max(128),
    topicId: z.string().trim().min(1).max(80),
    title: z.string().trim().min(3).max(240),
    overview: z.string().trim().min(10).max(800),
    objectives: z.array(z.string().trim().min(3).max(240)).min(1).max(8),
    prerequisites: z.array(z.string().trim().min(2).max(180)).max(8),
    subject: z.enum(['mathematics', 'physics', 'chemistry', 'biology', 'economics', 'computing', 'humanities', 'language', 'mixed']).optional(),
    supplementalDisclosure: z.string().trim().min(10).max(500).optional(),
    scenes: z.array(petrosDocumentTeachingSceneSchema).min(2).max(12),
    diagnostic: z
      .object({
        prompt: z.string().trim().min(8).max(600),
        responseType: z.enum(['choice', 'explanation']),
        choices: z.array(choiceSchema).max(5),
        hint: z.string().trim().min(8).max(500),
      })
      .strict(),
    sourceComplete: z.boolean(),
    sourcePageCount: z.number().int().positive(),
    coveredPages: z.array(z.number().int().positive()).min(1).max(200),
    coverage: z.object({
      suppliedPages: z.array(z.number().int().positive()).min(1).max(200),
      relevantPages: z.array(z.number().int().positive()).min(1).max(200),
      objectives: z.array(z.object({ objective: z.string().trim().min(3).max(240), pages: z.array(z.number().int().positive()).min(1).max(40), sceneIds: z.array(z.string().trim().min(1).max(80)).min(1).max(8) }).strict()).min(1).max(12),
    }).strict().optional(),
    generatedAt: z.string().datetime(),
  })
  .strict();
export type PetrosDocumentTeachingPlan = z.infer<
  typeof petrosDocumentTeachingPlanSchema
>;

export const petrosDocumentTeachingProgressSchema = z
  .object({
    draft: z.string().max(4_000).default(''),
    help: z
      .enum(['none', 'hint', 'example', 'simpler', 'deeper'])
      .default('none'),
    attempts: z
      .array(
        z
          .object({
            answer: z.string().max(4_000),
            correctness: z.enum(['correct', 'partial', 'incorrect']),
            feedback: z.string().max(1_200),
            at: z.string().datetime(),
            supported: z.boolean(),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    outcome: z
      .enum(['unseen', 'explored', 'unresolved', 'independent', 'supported', 'skipped'])
      .default('unseen'),
    completed: z.boolean().default(false),
    supportExposed: z.boolean().default(false),
    question: z.string().max(1_200).optional(),
    reply: z.string().max(3_000).optional(),
    exploration: z.record(z.union([z.string().max(500), z.number(), z.boolean()])).default({}),
  })
  .strict();
export type PetrosDocumentTeachingProgress = z.infer<
  typeof petrosDocumentTeachingProgressSchema
>;

export const petrosDocumentTeachingStateSchema = z
  .object({
    experience: z.literal(PETROS_DOCUMENT_TEACHING_EXPERIENCE),
    plan: petrosDocumentTeachingPlanSchema,
    scene: z.number().int().min(0),
    unlocked: z.number().int().min(0),
    mode: z.enum(['voice', 'text']).nullable(),
    level: z.enum(['foundations', 'balanced', 'stretch']),
    diagnosticComplete: z.boolean(),
    diagnosticAnswer: z.string().max(4_000).optional(),
    scenes: z.record(petrosDocumentTeachingProgressSchema),
    commands: z.array(z.string().uuid()).max(2_000),
  })
  .strict();
export type PetrosDocumentTeachingState = z.infer<
  typeof petrosDocumentTeachingStateSchema
>;

export const petrosDocumentTeachingActionSchema = z.discriminatedUnion(
  'action',
  [
    z
      .object({
        action: z.literal('explore'),
        scene: z.number().int().min(0),
        values: z.record(z.union([z.string().max(500), z.number(), z.boolean()])),
        idempotencyKey: z.string().uuid(),
        expectedVersion: z.number().int().nonnegative(),
      })
      .strict(),
    z
      .object({
        action: z.literal('mode'),
        mode: z.enum(['voice', 'text']),
        idempotencyKey: z.string().uuid(),
        expectedVersion: z.number().int().nonnegative(),
      })
      .strict(),
    z
      .object({
        action: z.literal('save'),
        scene: z.number().int().min(0),
        draft: z.string().max(4_000),
        idempotencyKey: z.string().uuid(),
        expectedVersion: z.number().int().nonnegative(),
      })
      .strict(),
    z
      .object({
        action: z.literal('help'),
        kind: z.enum(['hint', 'example', 'simpler', 'deeper']),
        idempotencyKey: z.string().uuid(),
        expectedVersion: z.number().int().nonnegative(),
      })
      .strict(),
    z
      .object({
        action: z.literal('complete'),
        scene: z.number().int().min(0),
        idempotencyKey: z.string().uuid(),
        expectedVersion: z.number().int().nonnegative(),
      })
      .strict(),
    z
      .object({
        action: z.literal('diagnostic'),
        answer: z.string().max(4_000),
        idempotencyKey: z.string().uuid(),
        expectedVersion: z.number().int().nonnegative(),
      })
      .strict(),
    z
      .object({
        action: z.literal('answer'),
        scene: z.number().int().min(0),
        answer: z.string().trim().min(1).max(4_000),
        idempotencyKey: z.string().uuid(),
        expectedVersion: z.number().int().nonnegative(),
      })
      .strict(),
    z
      .object({
        action: z.literal('ask'),
        question: z.string().trim().min(2).max(1_200),
        idempotencyKey: z.string().uuid(),
        expectedVersion: z.number().int().nonnegative(),
      })
      .strict(),
    z
      .object({
        action: z.literal('navigate'),
        scene: z.number().int().min(0),
        idempotencyKey: z.string().uuid(),
        expectedVersion: z.number().int().nonnegative(),
      })
      .strict(),
    z
      .object({
        action: z.literal('advance'),
        skip: z.boolean().default(false),
        idempotencyKey: z.string().uuid(),
        expectedVersion: z.number().int().nonnegative(),
      })
      .strict(),
  ],
);
export type PetrosDocumentTeachingAction = z.infer<
  typeof petrosDocumentTeachingActionSchema
>;

export const petrosDocumentTeachingEvaluationSchema = z
  .object({
    correctness: z.enum(['correct', 'partial', 'incorrect']),
    feedback: z.string().trim().min(1).max(1_200),
    safeNextHint: z.string().trim().min(1).max(700),
  })
  .strict();
export type PetrosDocumentTeachingEvaluation = z.infer<
  typeof petrosDocumentTeachingEvaluationSchema
>;
