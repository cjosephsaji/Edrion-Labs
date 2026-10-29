import { z } from 'zod';
import { canvasIdSchema, canvasOperationSchema, studentInteractionCheckpointSchema } from './canvas';
import { companionCueSchema } from './companion';
import { canonicalContent, teachingReferenceSchema, v2Key, v2Uuid } from './content';

export const fixtureEquationCheckSchema = z.object({
  rule: z.literal('slope-substitution'), x1: z.number().finite(), y1: z.number().finite(),
  x2: z.number().finite(), y2: z.number().finite(), numerator: z.number().finite(), denominator: z.number().finite(),
}).strict().superRefine((v, ctx) => {
  if (v.x2 === v.x1 || v.numerator !== v.y2 - v.y1 || v.denominator !== v.x2 - v.x1)
    ctx.addIssue({ code: 'custom', message: 'Unsupported or invalid reviewed slope substitution' });
});
const envelope = z.object({
  schemaVersion: z.literal('petros.v2.teaching-action.v1'), mode: z.literal('public_fixture'),
  compilerVersion: z.literal('fixture-subset.v1'), capabilityVersion: z.literal('canvas-subset.v1'),
  actionId: canvasIdSchema, activityId: canvasIdSchema, branchId: canvasIdSchema,
  sequence: z.number().int().min(1).max(64), expectedCanvasRevision: z.number().int().nonnegative(),
  sourceId: canvasIdSchema, purpose: z.string().min(1).max(500),
  operations: z.array(canvasOperationSchema).max(32), cue: companionCueSchema,
  checkpoint: z.never().optional(), equationCheck: z.never().optional(),
  cancellation: z.literal('preserve-semantic-prefix'),
}).strict();
export const teachingActionEnvelopeSchema = z.discriminatedUnion('type', [
  envelope.extend({ type: z.literal('read_source') }),
  envelope.extend({ type: z.literal('write_text') }),
  envelope.extend({ type: z.literal('write_equation') }),
  envelope.extend({ type: z.literal('transform_equation'), equationCheck: fixtureEquationCheckSchema }),
  envelope.extend({ type: z.literal('draw_diagram') }),
  envelope.extend({ type: z.literal('connect_elements') }),
  envelope.extend({ type: z.literal('highlight') }),
  envelope.extend({ type: z.literal('request_student_action'), checkpoint: studentInteractionCheckpointSchema }),
]).superRefine((a, ctx) => {
  if (a.type === 'transform_equation') {
    if (!a.equationCheck) ctx.addIssue({ code: 'custom', message: 'Equation checker required' });
    else {
      const c = a.equationCheck;
      const expected = `m = \\frac{${c.y2}-${c.y1}}{${c.x2}-${c.x1}} = \\frac{${c.numerator}}{${c.denominator}}`;
      const equations = a.operations.flatMap(op => op.type === 'add' && op.element.kind === 'equation' ? [op.element] : []);
      if (equations.length !== 1 || equations[0]?.tex !== expected) ctx.addIssue({ code: 'custom', message: 'Displayed equation does not match the checked transformation' });
    }
  }
  if (a.type === 'request_student_action' && !a.checkpoint) ctx.addIssue({ code: 'custom', message: 'Editable checkpoint required' });
});
export type TeachingActionEnvelope = z.infer<typeof teachingActionEnvelopeSchema>;

/** Future production envelope; the fixture union and its execution reducer remain unchanged. */
const productionEnvelope = z.object({ schemaVersion: z.literal('petros.v2.teaching-action.v2'),
  actionId: v2Uuid, sessionId: v2Uuid, objectiveId: v2Uuid, sequence: z.number().int().min(1).max(64),
  requiredCapability: v2Key, source: teachingReferenceSchema,
  target: z.object({ unitId: v2Uuid, elementId: v2Key, kind: z.enum(['unit', 'equation_step', 'code_line', 'table_cell', 'figure_node']) }).strict(),
  preconditions: z.object({ sessionRevision: z.number().int().nonnegative(), epoch: z.number().int().nonnegative(),
    canvasRevision: z.number().int().nonnegative(), draftRevision: z.number().int().nonnegative() }).strict(),
}).strict();
const targetOperation = z.discriminatedUnion('type', [
  z.object({ type: z.literal('read_source'), start: z.number().int().min(0).max(16000), end: z.number().int().positive().max(16000) }).strict(),
  z.object({ type: z.literal('write_text'), text: z.string().max(2000) }).strict(),
  z.object({ type: z.literal('write_equation'), stepId: v2Key }).strict(),
  z.object({ type: z.literal('draw_diagram'), nodeIds: z.array(v2Key).min(1).max(100) }).strict(),
  z.object({ type: z.literal('draw_graph'), familyId: v2Key, parameters: z.array(z.number().finite()).max(16) }).strict(),
  z.object({ type: z.literal('highlight'), elementIds: z.array(v2Key).min(1).max(16) }).strict(),
  z.object({ type: z.literal('annotate'), text: z.string().max(500) }).strict(),
  z.object({ type: z.literal('edit'), operation: canvasOperationSchema }).strict(),
  z.object({ type: z.literal('trace_code'), lineIds: z.array(v2Key).min(1).max(64) }).strict(),
  z.object({ type: z.literal('invoke_simulation'), kernelId: v2Key, parameters: z.array(z.number().finite()).max(16), steps: z.number().int().min(1).max(4096) }).strict(),
  z.object({ type: z.literal('request_student_action'), checkpointId: v2Uuid }).strict(),
  z.object({ type: z.literal('speak'), publicUtteranceId: v2Uuid }).strict(),
  z.object({ type: z.literal('gesture'), cueId: v2Uuid }).strict(),
  z.object({ type: z.literal('wait'), durationMs: z.number().int().min(0).max(60000) }).strict(),
  z.object({ type: z.literal('evaluate_submission'), committedSubmissionId: v2Uuid, owner: z.literal('private_assessment_service'),
    authority: z.literal('request_only') }).strict(),
]);
export const authorizedTeachingActionSchema = productionEnvelope.extend({ operation: targetOperation }).superRefine((a, ctx) => {
  if (a.source.unitId !== a.target.unitId) ctx.addIssue({ code: 'custom', message: 'Semantic source target mismatch' });
  if (a.operation.type === 'read_source' && a.operation.end <= a.operation.start) ctx.addIssue({ code: 'custom', message: 'Invalid read span' });
});
export const teachingExecutionReceiptSchema = z.object({ schemaVersion: z.literal('petros.v2.execution-receipt.v1'),
  actionId: v2Uuid, operationId: v2Uuid, epoch: z.number().int().nonnegative(), canvasRevision: z.number().int().nonnegative(),
  status: z.enum(['committed', 'rejected', 'abstained']), reason: z.string().max(500).nullable(),
}).strict();
/** Caller supplies server-resolved capability/target registries, never model-authored permissions. */
export function validateTeachingAction(input: unknown, authority: { sessionId: string; sessionRevision: number; epoch: number;
  canvasRevision: number; draftRevision: number; capabilities: ReadonlySet<string>; semanticTargets: ReadonlySet<string>;
  committedSubmissions: ReadonlySet<string>; nextSequence: number;
  sourcePins: ReadonlyMap<string, z.infer<typeof teachingReferenceSchema>>;
  allowedOperationFamilies: ReadonlyMap<string, ReadonlySet<string>>; objectiveIds: ReadonlySet<string>;
  kernels?: ReadonlyMap<string, { maxSteps: number; parameters: Array<{ min: number; max: number }> }> }) {
  if (new TextEncoder().encode(JSON.stringify(input)).length > 64000) throw new Error('ACTION_BUDGET_EXCEEDED');
  const a = authorizedTeachingActionSchema.parse(input);
  if (a.sessionId !== authority.sessionId || a.sequence !== authority.nextSequence || a.preconditions.sessionRevision !== authority.sessionRevision || a.preconditions.epoch !== authority.epoch ||
    a.preconditions.canvasRevision !== authority.canvasRevision || a.preconditions.draftRevision !== authority.draftRevision) throw new Error('STALE_ACTION_PRECONDITION');
  if (!authority.objectiveIds.has(a.objectiveId) || !authority.capabilities.has(a.requiredCapability) || !authority.semanticTargets.has(`${a.target.unitId}:${a.target.kind}:${a.target.elementId}`))
    throw new Error('UNAUTHORIZED_ACTION_TARGET_OR_CAPABILITY');
  if (!authority.allowedOperationFamilies.get(a.requiredCapability)?.has(a.operation.type) ||
    canonicalContent(authority.sourcePins.get(a.source.unitId) ?? null) !== canonicalContent(a.source)) throw new Error('UNAUTHORIZED_ACTION_SOURCE_OR_OPERATION');
  if (a.operation.type === 'evaluate_submission' && !authority.committedSubmissions.has(a.operation.committedSubmissionId)) throw new Error('UNCOMMITTED_SUBMISSION');
  if (a.operation.type === 'invoke_simulation') {
    const op = a.operation, kernel = authority.kernels?.get(op.kernelId);
    if (!kernel || a.requiredCapability !== op.kernelId || op.steps > kernel.maxSteps || op.parameters.length !== kernel.parameters.length ||
      op.parameters.some((p, i) => p < kernel.parameters[i]!.min || p > kernel.parameters[i]!.max)) throw new Error('UNAUTHORIZED_KERNEL_PARAMETERS');
  }
  return a;
}
