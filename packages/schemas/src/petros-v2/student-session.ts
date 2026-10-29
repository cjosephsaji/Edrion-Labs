import { z } from 'zod';
import {
  v2Uuid,
  v2Hash,
  teachingReferenceSchema,
  canonicalContent,
  contentPayloadSchema,
} from './content';
import { sharedCanvasStateSchema, studentCanvasCommandSchema } from './canvas';
import { publicTeachingStateSchema, simulationRequestSchema } from './teaching-engine';
import { companionEventSchema } from './companion';
import { learningUIPlanSchema } from './learning-ui';

const revision = z.number().int().nonnegative().max(1_000_000);
export const m4StageSchema = z.enum([
  'admitting',
  'planning',
  'delivering',
  'awaiting_response',
  'evaluating',
]);
export const m4ResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('choice'), choiceId: z.string().min(1).max(120) }).strict(),
  z
    .object({
      kind: z.literal('number'),
      value: z.number().finite(),
      unit: z.string().max(80),
    })
    .strict(),
  z
    .object({
      kind: z.literal('text'),
      text: z.string().trim().min(1).max(16000),
    })
    .strict(),
  z
    .object({
      kind: z.literal('structured'),
      values: z
        .record(z.string().min(1).max(120), z.union([z.string().max(2000), z.number().finite()]))
        .refine((v) => Object.keys(v).length <= 32),
    })
    .strict(),
  z
    .object({
      kind: z.literal('canvas_snapshot'),
      checkpointId: v2Uuid,
      text: z.string().max(16000),
    })
    .strict(),
]);
export const m4PublicTaskSchema = z
  .object({
    taskId: v2Uuid,
    instanceHash: v2Hash,
    prompt: z.string().min(1).max(4000),
    passage: z.string().max(12000).nullable(),
    responseKind: z.enum(['choice', 'number', 'text', 'structured', 'canvas_snapshot']),
    choices: z
      .array(
        z
          .object({
            id: z.string().min(1).max(120),
            label: z.string().min(1).max(500),
          })
          .strict(),
      )
      .max(16),
    fields: z
      .array(
        z
          .object({
            id: z.string().min(1).max(120),
            label: z.string().min(1).max(500),
            kind: z.enum(['text', 'number', 'choice']),
            choices: z
              .array(
                z
                  .object({
                    id: z.string().max(120),
                    label: z.string().max(500),
                  })
                  .strict(),
              )
              .max(16),
          })
          .strict(),
      )
      .max(32),
    helpPolicy: z.enum(['no_hints', 'assisted_practice']),
    citation: z.string().min(1).max(500),
  })
  .strict();
export const m4OutcomeSchema = z
  .object({
    criterionId: v2Uuid,
    label: z.string().min(1).max(500),
    status: z.enum(['satisfied', 'not_satisfied', 'abstained']),
    origin: z.enum(['trusted_kernel', 'review_required']),
    feedback: z.string().min(1).max(1000),
    // Public response locations only; never reference answers or private checkers.
    target: z
      .object({
        fieldId: z.string().min(1).max(120).optional(),
        elementIds: z.array(z.string().min(1).max(80)).max(64).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const m4EvaluationSchema = z
  .object({
    id: v2Uuid,
    responseId: v2Uuid,
    status: z.enum(['evaluated', 'review_required', 'unavailable', 'invalidated']),
    criteria: z.array(m4OutcomeSchema).min(1).max(32),
    evaluatorVersion: z.literal('petros.m4.kernel.v1'),
    supersedes: v2Uuid.nullable(),
    reason: z.string().max(500).nullable(),
  })
  .strict()
  .superRefine((result, ctx) => {
    if (
      new Set(result.criteria.map((c) => c.criterionId)).size !== result.criteria.length ||
      result.supersedes === result.id ||
      result.criteria.some((c) => c.status === 'satisfied' && c.origin !== 'trusted_kernel') ||
      (result.status === 'evaluated' &&
        result.criteria.some((c) => c.status === 'abstained' || c.origin !== 'trusted_kernel')) ||
      (['invalidated', 'unavailable'].includes(result.status) &&
        result.criteria.some((c) => c.status !== 'abstained'))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid criterion evaluation publication',
      });
  });
const base = { commandId: v2Uuid, expectedRevision: revision, epoch: revision };
export const m4CommitSchema = z
  .object({
    ...base,
    taskInstanceHash: v2Hash,
    canvasRevision: revision,
    response: m4ResponseSchema,
  })
  .strict();
export const m4CommandSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...base,
      type: z.literal('teach'),
      preference: z.enum(['repair', 'experiment', 'process', 'graph']).optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal('experiment'),
      input: simulationRequestSchema,
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal('teaching_step'),
      actionId: v2Uuid,
      nextBeat: revision,
    })
    .strict(),
  z.object({ ...base, type: z.literal('practice') }).strict(),
  z.object({ ...base, type: z.literal('complete_exploration') }).strict(),
  z.object({ ...base, type: z.literal('verify') }).strict(),
  z.object({ ...base, type: z.literal('next') }).strict(),
  z.object({ ...base, type: z.literal('pause') }).strict(),
  z.object({ ...base, type: z.literal('resume') }).strict(),
  z.object({ ...base, type: z.literal('interrupt') }).strict(),
  z.object({ ...base, type: z.literal('close') }).strict(),
  z.object({ ...base, type: z.literal('defer') }).strict(),
  z.object({ ...base, type: z.literal('replay_demo') }).strict(),
  z.object({ ...base, type: z.literal('undo') }).strict(),
  z.object({ ...base, type: z.literal('redo') }).strict(),
  z
    .object({
      ...base,
      type: z.literal('ask'),
      text: z.string().trim().min(1).max(2000),
      target: teachingReferenceSchema.optional(),
    })
    .strict(),
  z.object({ ...base, type: z.literal('hint') }).strict(),
  z
    .object({
      ...base,
      type: z.literal('canvas_edit'),
      edit: studentCanvasCommandSchema,
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal('canvas_checkpoint'),
      draft: z.string().max(16000),
      canvasRevision: revision,
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal('commit_activity_submission'),
      taskId: v2Uuid,
      taskInstanceHash: v2Hash,
      canvasRevision: revision,
      response: m4ResponseSchema,
    })
    .strict(),
]);
export const m4AdmissionSchema = z.object({ intentId: v2Uuid, commandId: v2Uuid }).strict();
export const m4LessonSchema = z
  .object({
    title: z.string().min(1).max(240),
    subject: z.string().min(1).max(240),
    objective: z
      .object({
        id: v2Uuid,
        version: z.number().int().positive(),
        label: z.string().min(1).max(2000),
      })
      .strict(),
    explanation: z.string().min(1).max(12000),
    citation: z.string().min(1).max(500),
    references: z.array(teachingReferenceSchema).min(1).max(16),
    // Exact reviewed public quotations for a read-only studio presentation.
    // Optional for historical M4 publications; never an assessment instrument.
    excerpts: z
      .array(
        z
          .object({
            text: z.string().min(1).max(2000),
            reference: teachingReferenceSchema,
            table: contentPayloadSchema
              .refine(
                (payload) =>
                  payload.kind === 'table' &&
                  payload.cells.length <= 64 &&
                  payload.cells.every((cell) => !cell.unresolved) &&
                  payload.cells.reduce((size, cell) => size + cell.value.length, 0) <= 12000,
                'Bounded resolved source table required',
              )
              .optional(),
          })
          .strict(),
      )
      .max(16)
      .optional(),
    limitations: z.array(z.string().max(500)).max(16),
  })
  .strict()
  .superRefine((lesson, ctx) => {
    if (
      lesson.excerpts?.some(
        (excerpt) =>
          !lesson.references.some(
            (reference) => canonicalContent(reference) === canonicalContent(excerpt.reference),
          ),
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Excerpt outside reviewed source references',
      });
  });
export const m4SnapshotSchema = z
  .object({
    engine: z.literal('v2'),
    id: v2Uuid,
    lesson: m4LessonSchema.nullable(),
    status: z.enum(['active', 'paused', 'blocked', 'closed']),
    stage: m4StageSchema,
    revision,
    epoch: revision,
    task: m4PublicTaskSchema.nullable(),
    draft: z.string().max(16000),
    canvas: sharedCanvasStateSchema.nullable(),
    checkpointId: v2Uuid.nullable(),
    teaching: publicTeachingStateSchema.nullable().optional(),
    learningUI: learningUIPlanSchema.optional(),
    companion: companionEventSchema.optional(),
    submission: z
      .object({
        id: v2Uuid,
        commandId: v2Uuid,
        status: z.enum(['pending', 'complete']),
        response: m4ResponseSchema,
      })
      .strict()
      .nullable(),
    evaluation: m4EvaluationSchema.nullable(),
    actions: z.array(z.string().max(80)).max(20),
    assistance: z.enum(['independent', 'assisted']).default('independent'),
    progress: z
      .object({
        contentViewed: z.boolean(),
        responsesCommitted: revision,
        responsesEvaluated: revision,
        criteriaObserved: revision,
        mastery: z.literal(false),
      })
      .strict(),
    message: z.string().max(1000),
  })
  .strict();
export const m4ReceiptSchema = z
  .object({
    commandId: v2Uuid,
    status: z.enum(['committed', 'pending', 'complete', 'blocked', 'unavailable']),
    revision,
    epoch: revision,
    responseId: v2Uuid.nullable(),
    message: z.string().max(500),
  })
  .strict();
export type M4Snapshot = z.infer<typeof m4SnapshotSchema>;
export type M4Command = z.infer<typeof m4CommandSchema>;
export type M4Commit = z.infer<typeof m4CommitSchema>;
export type M4Response = z.infer<typeof m4ResponseSchema>;
export type M4Evaluation = z.infer<typeof m4EvaluationSchema>;
export type M4Receipt = z.infer<typeof m4ReceiptSchema>;
