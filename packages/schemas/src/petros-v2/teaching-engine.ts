import { z } from 'zod';
import {
  canvasElementSchema,
  canvasOperationSchema,
  studentInteractionCheckpointSchema,
} from './canvas';
import { teachingReferenceSchema, v2Uuid, v2Hash } from './content';
import { presentationCheckpointSchema } from './timeline';
import { resourceCapacityInputSchema } from './resource-capacity';

export const instructionalStrategySchema = z.enum([
  'orientation',
  'source_explanation',
  'clarifying_question',
  'vocabulary_repair',
  'conceptual_contrast',
  'method_repair',
  'warrant_inspection',
  'assumption_comparison',
  'worked_example',
  'faded_support',
  'bounded_experiment',
  'participation',
  'fresh_verification',
  'review_required',
  'unavailable',
]);
export const hypothesisCategorySchema = z.enum([
  'conceptual',
  'terminology',
  'arithmetic',
  'assumption',
  'missing_step',
  'unsupported_link',
  'ambiguous',
]);
const key = z.string().regex(/^[a-z][a-z0-9._-]{0,79}$/);
const text = z.string().min(1).max(2000);
export const checkedQuantitySchema = z
  .object({
    value: z.number().finite().min(-1e9).max(1e9),
    unit: z.enum(['1', 'GB', 'VM', 'GB/VM', 'requests', 'seconds', 'requests/second']),
  })
  .strict();
export const equationStepSchema = z
  .object({
    id: key,
    rule: z.enum(['add', 'subtract', 'multiply', 'divide', 'floor']),
    inputs: z.array(checkedQuantitySchema).min(1).max(2),
    result: checkedQuantitySchema,
    assumptions: z.array(text).max(8),
    corrects: key.nullable(),
    elementId: key,
  })
  .strict();
export const simulationRequestSchema = z.discriminatedUnion('kernel', [
  resourceCapacityInputSchema,
  z
    .object({
      kernel: z.literal('linear-rate.v1'),
      rate: z.number().finite().min(0).max(1e6),
      seconds: z.number().finite().min(0).max(1e4),
    })
    .strict(),
  z
    .object({
      kernel: z.literal('projectile-no-drag.v1'),
      vx: z.number().finite().min(-100).max(100),
      vy: z.number().finite().min(0).max(100),
      gravity: z.number().finite().min(1).max(25),
      seconds: z.number().finite().min(0).max(200),
    })
    .strict(),
]);
/** Reviewed public instruction, separate from the instrument's private expected response. */
export const teachingFragmentSchema = z
  .object({
    id: key,
    strategies: z.array(instructionalStrategySchema).min(1).max(12),
    criterionIds: z.array(v2Uuid).max(32),
    capability: z.enum([
      'source',
      'diagram',
      'equation',
      'graph',
      'table',
      'process',
      'simulation',
      'code_trace',
    ]),
    reference: teachingReferenceSchema,
    quote: text,
    explanation: text,
    accessibleAlternative: text,
    additionalSources: z
      .array(z.object({ reference: teachingReferenceSchema, quote: text }).strict())
      .max(8)
      .optional(),
    focusByCriterion: z
      .array(
        z
          .object({
            criterionId: v2Uuid,
            elementIds: z.array(key).min(1).max(16),
          })
          .strict(),
      )
      .max(32)
      .optional(),
    workBindings: z
      .array(z.object({ elementId: key, field: key }).strict())
      .max(16)
      .optional(),
    operations: z.array(canvasOperationSchema).min(1).max(32),
    relationships: z
      .array(
        z
          .object({
            from: key,
            to: key,
            relation: z.enum(['supports', 'connects', 'provides']),
            directionReviewed: z.literal(true),
          })
          .strict(),
      )
      .max(32),
    equationSteps: z.array(equationStepSchema).max(16),
    graphModel: z
      .object({
        kernel: z.literal('linear-rate.v1'),
        rate: z.number().finite().min(0).max(1e6),
      })
      .strict()
      .optional(),
    simulation: simulationRequestSchema.nullable(),
    checkpoint: studentInteractionCheckpointSchema.nullable(),
    expectedObservation: text,
    limitations: z.array(text).max(8),
  })
  .strict();
export const teachingManifestSchema = z
  .object({
    version: z.literal('petros.m5.reviewed.v1'),
    graphVersion: key,
    prerequisites: z.array(z.object({ from: v2Uuid, to: v2Uuid }).strict()).max(64),
    criteria: z
      .array(
        z
          .object({
            id: v2Uuid,
            conceptId: v2Uuid,
            conceptVersion: z.number().int().positive(),
            category: hypothesisCategorySchema,
            role: z.enum(['concept', 'method', 'explanation', 'application']),
            distinguishes: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(32),
    fragments: z.array(teachingFragmentSchema).min(1).max(24),
    taskRole: z.enum(['initial', 'practice', 'verification']),
    fragmentIds: z.array(key).max(24),
  })
  .strict();
export type TeachingManifest = z.infer<typeof teachingManifestSchema>;
export type TeachingFragment = z.infer<typeof teachingFragmentSchema>;
export type InstructionalStrategy = z.infer<typeof instructionalStrategySchema>;
export type EquationStep = z.infer<typeof equationStepSchema>;
export type SimulationRequest = z.infer<typeof simulationRequestSchema>;
export const instructionalDecisionSchema = z
  .object({
    version: z.literal('petros.m5.decision.v1'),
    id: v2Uuid,
    objectiveId: v2Uuid,
    strategy: instructionalStrategySchema,
    fragmentId: key.nullable(),
    criterionId: v2Uuid.nullable(),
    evidenceIds: z.array(v2Uuid).max(64),
    hypothesis: hypothesisCategorySchema.nullable(),
    uncertainty: z.enum([
      'no_evidence',
      'candidate',
      'supported',
      'conflicting',
      'review_required',
      'observed',
    ]),
    reason: text,
    expectedObservation: text,
    rejectedAlternatives: z.array(text).max(8),
    origin: z.enum(['deterministic_policy', 'controlled_provider', 'genuine_model']),
    termination: z.enum([
      'student_checkpoint',
      'fresh_check',
      'review_required',
      'scope_unavailable',
      'capability_unavailable',
      'budget',
      'complete',
    ]),
  })
  .strict();
export type InstructionalDecision = z.infer<typeof instructionalDecisionSchema>;
export const compiledTeachingActionSchema = z
  .object({
    version: z.literal('petros.m5.action.v1'),
    id: v2Uuid,
    sessionId: v2Uuid,
    publicationHash: v2Hash,
    epoch: z.number().int().nonnegative(),
    expectedCanvasRevision: z.number().int().nonnegative(),
    decision: instructionalDecisionSchema,
    fragment: teachingFragmentSchema,
    beats: z
      .array(
        z
          .object({
            id: key,
            operations: z.array(canvasOperationSchema).min(1).max(32),
            caption: text,
            targetId: key.nullable(),
            accessibleAlternative: text,
          })
          .strict(),
      )
      .min(1)
      .max(32),
  })
  .strict();
export const teachingRuntimeSchema = z
  .object({
    action: compiledTeachingActionSchema,
    nextBeat: z.number().int().min(0).max(32),
    status: z.enum(['presenting', 'participating', 'complete']),
    acceptedPrefix: z.array(key).max(32),
    timeline: presentationCheckpointSchema,
    experiment: z
      .object({
        kernel: z.string().max(80),
        values: z.record(z.number().finite()),
        summary: text,
        input: simulationRequestSchema.optional(),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
/** Public projection contains only accepted public instruction. Hidden while an independent task is issued. */
export const publicTeachingStateSchema = z
  .object({
    capability: teachingFragmentSchema.shape.capability.optional(),
    decision: instructionalDecisionSchema,
    actionId: v2Uuid,
    caption: text,
    nextBeat: z.number().int().min(0),
    beatCount: z.number().int().positive(),
    status: z.enum(['presenting', 'participating', 'complete']),
    reference: teachingReferenceSchema,
    accessibleAlternative: text,
    limitations: z.array(text).max(8),
    cue: z.enum(['teaching', 'point', 'yield', 'waiting', 'uncertain']),
    targetId: key.nullable(),
    // Checked public examples for equation elements already revealed on the canvas.
    // Optional for saved sessions created before the visual equation board.
    equationSteps: z.array(equationStepSchema).max(16).optional(),
    completedStepIds: z.array(key).max(16).optional(),
    progressResponseId: v2Uuid.nullable().optional(),
    simulation: simulationRequestSchema.nullable().optional(),
    experiment: z
      .object({
        kernel: z.string().max(80),
        values: z.record(z.number().finite()),
        summary: text,
        input: simulationRequestSchema.optional(),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
export const committedWorkSchema = z
  .object({
    responseId: v2Uuid,
    checkpointId: v2Uuid,
    hash: v2Hash,
    elements: z.array(canvasElementSchema).max(64),
    changedElementIds: z.array(key).max(64),
    assisted: z.boolean(),
  })
  .strict();
