import { randomUUID } from 'node:crypto';
import {
  compiledTeachingActionSchema,
  instructionalDecisionSchema,
  applyTrustedCanvasOperations,
  type InstructionalDecision,
  type SharedCanvasState,
} from '@edrion/schemas';
import type { PetrosTeachingContext } from './petros-v2-context';
import { validateTeachingFragment } from './petros-teaching-actions';

/** Compile only an exact reviewed composition. A future model may choose/combine reviewed capabilities
 * after the same checks; it never supplies an unchecked patch or evaluator instruction. */
export function compileTeachingExperience(
  decision: InstructionalDecision,
  ctx: PetrosTeachingContext,
) {
  decision = instructionalDecisionSchema.parse(decision);
  if (
    decision.evidenceIds.some(
      (id) => !ctx.evidence.some((e) => e.committed && e.evaluation.id === id),
    )
  )
    throw new Error('M5_UNCOMMITTED_DECISION_EVIDENCE');
  if (!decision.fragmentId || decision.objectiveId !== ctx.objectiveId)
    throw new Error('M5_NO_AUTHORIZED_ACTION');
  const fragment = validateTeachingFragment(
    ctx.manifest.fragments.find((f) => f.id === decision.fragmentId),
    ctx,
  );
  if (!fragment.strategies.includes(decision.strategy)) throw new Error('M5_STRATEGY_MISMATCH');
  if (!ctx.canvas || (ctx.canvas.invitation && !ctx.canvas.invitation.submitted))
    throw new Error('M5_STUDENT_EDIT_IN_PROGRESS');
  const focus = fragment.focusByCriterion?.find((f) => f.criterionId === decision.criterionId);
  const operations = fragment.operations.map((raw) => {
    if (raw.type === 'highlight' && focus) return { ...raw, ids: focus.elementIds };
    if (
      raw.type === 'add' &&
      raw.element.kind === 'equation' &&
      raw.element.editable &&
      ctx.committedResponse?.kind === 'structured'
    ) {
      const binding = fragment.workBindings?.find((b) => b.elementId === raw.element.id),
        value = binding ? ctx.committedResponse.values[binding.field] : undefined;
      if (value !== undefined)
        return { ...raw, element: { ...raw.element, value: String(value).slice(0, 120) } };
    }
    return raw;
  });
  const beats = operations.map((operation, i) => ({
    id: `beat-${i + 1}`,
    operations:
      operation.type === 'add' && operation.element.kind === 'allocation'
        ? [operation, { type: 'focus_view' as const, id: operation.element.id }]
        : [operation],
    caption:
      operation.type === 'change_allocation'
        ? `I’ve tested ${operation.requestedCount} whole VM${operation.requestedCount === 1 ? '' : 's'} in this model. Predict whether another fits, then try it yourself.`
        : operation.type === 'add' && operation.element.kind === 'allocation'
          ? 'Inspect total memory and the fixed host reservation. This is a simplified memory-only model.'
          : fragment.explanation,
    targetId:
      operation.type === 'add' || operation.type === 'connect_elements'
        ? operation.element.id
        : operation.type === 'highlight'
          ? (operation.ids[0] ?? null)
          : 'id' in operation
            ? operation.id
            : null,
    accessibleAlternative: fragment.accessibleAlternative,
  }));
  // Preflight every prefix, including deleted/invalid targets, before any operation is published.
  let canvas: SharedCanvasState = ctx.canvas;
  for (const beat of beats)
    canvas = applyTrustedCanvasOperations(canvas, beat.operations, canvas.revision);
  if (fragment.checkpoint) {
    for (const id of fragment.checkpoint.editableIds)
      if (!canvas.elements.some((e) => e.id === id && e.editable))
        throw new Error('M5_INVALID_CHECKPOINT');
  }
  return compiledTeachingActionSchema.parse({
    version: 'petros.m5.action.v1',
    id: randomUUID(),
    sessionId: ctx.sessionId,
    publicationHash: ctx.publicationHash,
    epoch: ctx.epoch,
    expectedCanvasRevision: ctx.canvas.revision,
    decision,
    fragment,
    beats,
  });
}
