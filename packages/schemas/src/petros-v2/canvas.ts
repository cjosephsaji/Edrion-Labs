import { z } from 'zod';
import { teachingReferenceSchema, v2Hash, v2Key, v2Uuid } from './content';
import { resourceAllocationSchema, allocationPredictionSchema } from './resource-capacity';

export const canvasIdSchema = z.string().regex(/^[a-z][a-z0-9._-]{0,79}$/);
const label = z.string().min(1).max(500);
const base = {
  id: canvasIdSchema,
  version: z.number().int().min(1),
  label,
  sourceId: canvasIdSchema,
  editable: z.boolean(),
  parentId: canvasIdSchema.nullable().optional(),
  accessibleText: z.string().min(1).max(2000).optional(),
  annotation: z.string().max(500).optional(),
  completed: z.boolean().optional(),
  parameter: z
    .object({
      min: z.number().finite(),
      max: z.number().finite(),
      value: z.number().finite(),
      unit: z.string().max(40),
    })
    .strict()
    .optional(),
  classifications: z.array(z.string().min(1).max(120)).max(16).optional(),
};
export const canvasElementSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('allocation'), resource: resourceAllocationSchema }).strict(),
  z
    .object({
      ...base,
      kind: z.literal('graph'),
      xUnit: z.literal('seconds'),
      yUnit: z.literal('requests'),
      points: z
        .array(
          z
            .object({
              x: z.number().finite().min(0).max(10000),
              y: z.number().finite().min(0).max(1e9),
            })
            .strict(),
        )
        .min(2)
        .max(64),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('table'),
      columns: z.array(label).min(1).max(8),
      rows: z
        .array(z.array(z.string().max(120)).min(1).max(8))
        .min(1)
        .max(32),
      editableCells: z
        .array(
          z
            .object({
              row: z.number().int().min(0).max(31),
              column: z.number().int().min(0).max(7),
            })
            .strict(),
        )
        .max(64),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('trace'),
      lines: z
        .array(
          z
            .object({
              id: canvasIdSchema,
              text: z.string().min(1).max(500),
              state: z
                .record(z.union([z.string().max(120), z.number().finite()]))
                .refine((v) => Object.keys(v).length <= 8),
            })
            .strict(),
        )
        .min(1)
        .max(32),
      currentLine: z.number().int().min(0).max(31),
    })
    .strict(),
  z.object({ ...base, kind: z.literal('text'), text: z.string().min(1).max(2000) }).strict(),
  z
    .object({
      ...base,
      kind: z.literal('equation'),
      tex: z.string().min(1).max(500),
      explanation: label,
      value: z.string().max(120),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('node'),
      text: z.string().min(1).max(120),
      x: z.number().min(90).max(510),
      y: z.number().min(35).max(285),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('edge'),
      from: canvasIdSchema,
      to: canvasIdSchema,
      relation: z.enum(['supports', 'connects', 'provides']),
      text: z.string().min(1).max(80),
    })
    .strict(),
]);
export type CanvasElement = z.infer<typeof canvasElementSchema>;
export const canvasOperationSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('close_allocation_attempt'),
      id: canvasIdSchema,
      expectedVersion: z.number().int().positive(),
      attemptId: z.string().min(1).max(160),
      disposition: z.enum(['next', 'cancel']),
    })
    .strict(),
  z
    .object({
      type: z.literal('predict_allocation'),
      id: canvasIdSchema,
      expectedVersion: z.number().int().positive(),
      prediction: allocationPredictionSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('change_allocation'),
      id: canvasIdSchema,
      expectedVersion: z.number().int().positive(),
      requestedCount: z.number().int().min(0).max(1e9),
      attemptId: z.string().min(1).max(160).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('replace_cell'),
      id: canvasIdSchema,
      expectedVersion: z.number().int().positive(),
      row: z.number().int().min(0).max(31),
      column: z.number().int().min(0).max(7),
      value: z.string().max(120),
    })
    .strict(),
  z
    .object({
      type: z.literal('trace_step'),
      id: canvasIdSchema,
      expectedVersion: z.number().int().positive(),
      line: z.number().int().min(0).max(31),
    })
    .strict(),
  z
    .object({
      type: z.literal('annotate'),
      id: canvasIdSchema,
      expectedVersion: z.number().int().positive(),
      text: z.string().min(1).max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal('complete_step'),
      id: canvasIdSchema,
      expectedVersion: z.number().int().positive(),
      completed: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('classify'),
      id: canvasIdSchema,
      expectedVersion: z.number().int().positive(),
      value: z.string().min(1).max(120),
    })
    .strict(),
  z
    .object({
      type: z.literal('set_parameter'),
      id: canvasIdSchema,
      expectedVersion: z.number().int().positive(),
      value: z.number().finite(),
    })
    .strict(),
  z
    .object({
      type: z.literal('disconnect'),
      id: canvasIdSchema,
      expectedVersion: z.number().int().positive(),
    })
    .strict(),
  z.object({ type: z.literal('add'), element: canvasElementSchema }).strict(),
  z
    .object({
      type: z.literal('replace_content'),
      id: canvasIdSchema,
      expectedVersion: z.number().int().positive(),
      text: z.string().max(120),
    })
    .strict(),
  z
    .object({
      type: z.literal('move_element'),
      id: canvasIdSchema,
      expectedVersion: z.number().int().positive(),
      x: z.number().min(90).max(510),
      y: z.number().min(35).max(285),
    })
    .strict(),
  z.object({ type: z.literal('connect_elements'), element: canvasElementSchema }).strict(),
  z
    .object({
      type: z.literal('erase'),
      id: canvasIdSchema,
      expectedVersion: z.number().int().positive(),
    })
    .strict(),
  z.object({ type: z.literal('highlight'), ids: z.array(canvasIdSchema).max(16) }).strict(),
  z.object({ type: z.literal('focus_view'), id: canvasIdSchema.nullable() }).strict(),
]);
export type CanvasOperation = z.infer<typeof canvasOperationSchema>;
export const studentInteractionCheckpointSchema = z
  .object({
    id: canvasIdSchema,
    prompt: label,
    editableIds: z.array(canvasIdSchema).min(1).max(64),
    allowedOperations: z
      .array(
        z.enum([
          'replace_content',
          'predict_allocation',
          'close_allocation_attempt',
          'change_allocation',
          'replace_cell',
          'trace_step',
          'move_element',
          'connect_elements',
          'erase',
          'annotate',
          'complete_step',
          'classify',
          'set_parameter',
          'disconnect',
          'add',
          'highlight',
        ]),
      )
      .min(1)
      .max(16),
    submitted: z.boolean(),
  })
  .strict();
export const sharedCanvasStateSchema = z
  .object({
    schemaVersion: z.literal('petros.v2.canvas.v1'),
    mode: z.enum(['public_fixture', 'session']),
    activityId: canvasIdSchema,
    branchId: canvasIdSchema,
    revision: z.number().int().nonnegative().max(10000),
    draftRevision: z.number().int().nonnegative().max(10000),
    lastActionSequence: z.number().int().nonnegative().max(64),
    elements: z.array(canvasElementSchema).max(64),
    completedActionIds: z.array(canvasIdSchema).max(64),
    highlightedIds: z.array(canvasIdSchema).max(16),
    focusedId: canvasIdSchema.nullable(),
    invitation: studentInteractionCheckpointSchema.nullable(),
    authorizedSourceIds: z.array(canvasIdSchema).max(16).optional(),
  })
  .strict();
export type SharedCanvasState = z.infer<typeof sharedCanvasStateSchema>;
export const studentCanvasCommandSchema = z
  .object({
    mode: z.enum(['public_fixture', 'session']),
    activityId: canvasIdSchema,
    branchId: canvasIdSchema,
    checkpointId: canvasIdSchema,
    expectedRevision: z.number().int().nonnegative(),
    expectedDraftRevision: z.number().int().nonnegative(),
    operations: z.array(canvasOperationSchema).min(1).max(32),
  })
  .strict();
export type StudentCanvasCommand = z.infer<typeof studentCanvasCommandSchema>;

export const canvasSourceAnchorSchema = z
  .object({
    elementId: v2Key,
    source: teachingReferenceSchema,
    kind: z.enum(['unit', 'equation_step', 'code_line', 'table_cell', 'figure_node']),
    semanticId: v2Key,
  })
  .strict();
/** Durable metadata reuses the existing bounded operations. M4 owns storage/execution. */
export const canvasOperationBatchSchema = z
  .object({
    schemaVersion: z.literal('petros.v2.canvas-batch.v1'),
    commandId: v2Uuid,
    operationId: v2Uuid,
    requestHash: v2Hash,
    activityId: v2Uuid,
    epoch: z.number().int().nonnegative(),
    expectedCanvasRevision: z.number().int().nonnegative(),
    expectedDraftRevision: z.number().int().nonnegative(),
    checkpointId: v2Uuid,
    operations: z.array(canvasOperationSchema).min(1).max(32),
    anchors: z.array(canvasSourceAnchorSchema).max(64),
    editableRegions: z
      .array(
        z
          .object({
            id: v2Key,
            elements: z.array(v2Key).min(1).max(64),
            operations: z
              .array(
                z.enum([
                  'replace_content',
                  'predict_allocation',
                  'close_allocation_attempt',
                  'change_allocation',
                  'replace_cell',
                  'trace_step',
                  'move_element',
                  'connect_elements',
                  'erase',
                  'annotate',
                  'complete_step',
                  'classify',
                  'set_parameter',
                  'disconnect',
                  'add',
                  'highlight',
                ]),
              )
              .min(1)
              .max(16),
          })
          .strict(),
      )
      .max(16),
  })
  .strict();
export const canvasSubmissionSnapshotSchema = z
  .object({
    schemaVersion: z.literal('petros.v2.canvas-submission.v1'),
    id: v2Uuid,
    activityId: v2Uuid,
    checkpointId: v2Uuid,
    canvasRevision: z.number().int().nonnegative(),
    draftRevision: z.number().int().nonnegative(),
    contentHash: v2Hash,
    elements: z.array(canvasElementSchema).max(64),
    anchors: z.array(canvasSourceAnchorSchema).max(64),
    undoBoundary: z
      .object({
        lastOperationId: v2Uuid.nullable(),
        lastSubmittedRevision: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
