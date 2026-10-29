import { z } from 'zod';
import {
  m4LessonSchema,
  type M4Evaluation,
  m4PublicTaskSchema,
  m4StageSchema,
  sharedCanvasStateSchema,
  sourceBindingSchema,
  teachingManifestSchema,
  teachingRuntimeSchema,
} from '@edrion/schemas';
import { createHash } from 'node:crypto';
import { compatibilityCanonicalJson } from '@edrion/schemas';
export const m4Hash = (value: unknown) =>
  createHash('sha256').update(compatibilityCanonicalJson(value)).digest('hex');
const uuid = z.string().uuid(),
  hash = z.string().regex(/^[a-f0-9]{64}$/);
/** API-only private checker registry. No provider calls or executable expressions. */
export const m4InstrumentSchema = z
  .object({
    schemaVersion: z.literal('petros.v2.m4-private-instrument.v1'),
    id: uuid,
    version: z.number().int().positive(),
    proposalId: uuid,
    proposalVersion: z.number().int().positive(),
    proposalHash: hash,
    objectiveId: uuid,
    objectiveVersion: z.number().int().positive(),
    sourceRevisionId: uuid,
    sourceHash: hash,
    equivalenceKey: z.string().min(1).max(180),
    kind: z.enum(['criterion_observation', 'transfer']),
    publicTask: m4PublicTaskSchema.omit({ taskId: true, instanceHash: true }),
    publicCanvas: sharedCanvasStateSchema.nullable().default(null),
    criteria: z
      .array(
        z
          .object({
            id: uuid,
            label: z.string().min(1).max(500),
            checker: z.discriminatedUnion('kind', [
              z
                .object({
                  kind: z.literal('canvas_value'),
                  elementId: z.string().min(1).max(80),
                  expected: z.string().max(120),
                })
                .strict(),
              z
                .object({
                  kind: z.literal('canvas_relation'),
                  from: z.string().min(1).max(80),
                  to: z.string().min(1).max(80),
                  relation: z.enum(['supports', 'connects', 'provides']),
                })
                .strict(),
              z
                .object({
                  kind: z.literal('exact'),
                  field: z.string().min(1).max(120),
                  accepted: z.array(z.string().min(1).max(120)).min(1).max(16),
                })
                .strict(),
              z
                .object({
                  kind: z.literal('numeric'),
                  field: z.string().min(1).max(120),
                  expected: z.number().finite(),
                  tolerance: z.number().min(0).max(1e6),
                  unit: z.string().max(80),
                })
                .strict(),
              z
                .object({
                  kind: z.literal('qualitative'),
                  rubric: z.string().min(1).max(4000),
                  alternatives: z.array(z.string().max(2000)).max(16),
                })
                .strict(),
            ]),
          })
          .strict(),
      )
      .min(1)
      .max(32),
    privateDiscriminators: z.array(z.string().max(2000)).max(16),
    teaching: teachingManifestSchema.optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (new Set(v.criteria.map((x) => x.id)).size !== v.criteria.length)
      c.addIssue({ code: 'custom', message: 'Duplicate criterion' });
  });
export type M4Instrument = z.infer<typeof m4InstrumentSchema>;
export const m4PublicationSchema = z
  .object({
    schemaVersion: z.literal('petros.v2.student-publication.v1'),
    proposalId: uuid,
    proposalVersion: z.number().int().positive(),
    proposalHash: hash,
    courseId: uuid,
    classId: uuid,
    subjectId: uuid,
    curriculumRevision: z.number().int().positive(),
    activityId: uuid,
    activityVersion: z.number().int().positive(),
    sourceRevisionId: uuid,
    sourceHash: hash,
    binding: sourceBindingSchema,
    lesson: m4LessonSchema,
    recipientIds: z.array(uuid).min(1).max(500),
    reviews: z.array(uuid).min(3).max(16),
    instruments: z
      .array(
        z
          .object({
            candidateId: uuid,
            reviewId: uuid,
            familyId: uuid,
            version: z.number().int().positive(),
            hash,
            teaching: teachingManifestSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    canvas: sharedCanvasStateSchema.nullable(),
  })
  .strict();
export type M4Publication = z.infer<typeof m4PublicationSchema>;
export const m4StateSchema = z
  .object({
    publicationId: uuid,
    publicationHash: hash,
    admissionIntentId: uuid,
    requestedBy: uuid,
    stage: m4StageSchema,
    epoch: z.number().int().nonnegative(),
    taskId: uuid.nullable(),
    responseId: uuid.nullable(),
    contentViewed: z.boolean(),
    draft: z.string().max(16000),
    checkpointId: uuid.nullable(),
    workspaceId: uuid.nullable(),
    undo: z.array(uuid).max(50),
    redo: z.array(uuid).max(50),
    blockedReason: z.string().max(500).nullable(),
    teaching: teachingRuntimeSchema.nullable().optional(),
    teachingDecisions: z.number().int().min(0).max(20).optional(),
    teachingNotice: z.string().max(2000).optional(),
  })
  .strict();
export type M4State = z.infer<typeof m4StateSchema>;

/** Validation metadata never includes a reference answer, rubric or discriminator. */
export const m4CriterionManifestSchema = z
  .array(
    z
      .object({
        id: uuid,
        label: z.string().min(1).max(500),
        checkerKind: z.enum(['exact', 'numeric', 'qualitative', 'canvas_value', 'canvas_relation']),
      })
      .strict(),
  )
  .min(1)
  .max(32);
export function m4EvaluationMatchesManifest(result: M4Evaluation, raw: unknown): boolean {
  const parsed = m4CriterionManifestSchema.safeParse(raw);
  if (!parsed.success) return false;
  const manifest = parsed.data;
  if (
    result.supersedes !== null ||
    result.evaluatorVersion !== 'petros.m4.kernel.v1' ||
    result.criteria.length !== manifest.length
  )
    return false;
  return manifest.every((expected) => {
    const actual = result.criteria.find((c) => c.criterionId === expected.id);
    if (!actual || actual.label !== expected.label) return false;
    return expected.checkerKind === 'qualitative'
      ? actual.status === 'abstained' && actual.origin === 'review_required'
      : actual.origin === 'trusted_kernel' &&
          ['satisfied', 'not_satisfied'].includes(actual.status);
  });
}
