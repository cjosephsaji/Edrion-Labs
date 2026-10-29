import {
  teachingFragmentSchema,
  type TeachingFragment,
  type SharedCanvasState,
  type M4Evaluation,
  type M4Response,
} from '@edrion/schemas';
import type { PetrosTeachingContext } from './petros-v2-context';
import { m4Hash } from './petros-v2-contracts.server';
import { runTrustedExperiment, validateEquationStep } from './petros-equation-validator';

/** Presentation progress reuses the original public evaluation and reviewed work
 * bindings. Matching labels/element IDs alone cannot complete a new example. */
export function completedEquationSteps(
  fragment: TeachingFragment,
  canvas: SharedCanvasState | null,
  revealed: ReadonlySet<string>,
  response: { id: string; response: M4Response } | null,
  evaluation: M4Evaluation | null,
) {
  if (
    !response ||
    response.response.kind !== 'structured' ||
    evaluation?.responseId !== response.id ||
    !['evaluated', 'review_required'].includes(evaluation.status)
  )
    return [];
  const values = response.response.values;
  return [
    ...new Set(
      (fragment.workBindings ?? []).flatMap((binding) => {
        const e = canvas?.elements.find((e) => e.kind === 'equation' && e.id === binding.elementId);
        const step = fragment.equationSteps.find((s) => s.elementId === binding.elementId);
        const value = values[binding.field];
        return e?.kind === 'equation' &&
          step &&
          revealed.has(e.id) &&
          e.sourceId === `source-${fragment.reference.unitId}` &&
          value !== undefined &&
          e.value === String(value) &&
          e.value === String(step.result.value) &&
          evaluation.criteria.some(
            (c) =>
              c.target?.fieldId === binding.field &&
              c.origin === 'trusted_kernel' &&
              c.status === 'satisfied',
          )
          ? [e.id]
          : [];
      }),
    ),
  ];
}

/** Authority and academic meaning are reviewed separately from structural/mathematical validation. */
export function validateTeachingFragment(
  raw: unknown,
  ctx: PetrosTeachingContext,
): TeachingFragment {
  if (Buffer.byteLength(JSON.stringify(raw)) > 48 * 1024)
    throw new Error('M5_ACTION_PAYLOAD_LIMIT');
  const f = teachingFragmentSchema.parse(raw);
  if (!Object.values(ctx.authority).every(Boolean) || ctx.independentTaskOpen)
    throw new Error('M5_AUTHORITY');
  if (!ctx.capabilities.includes(f.capability) || !ctx.accessibility.textAlternative)
    throw new Error('M5_CAPABILITY_UNAVAILABLE');
  if (!ctx.manifest.fragments.some((approved) => m4Hash(approved) === m4Hash(f)))
    throw new Error('M5_UNREVIEWED_COMPOSITION');
  const sources = [{ reference: f.reference, quote: f.quote }, ...(f.additionalSources ?? [])];
  for (const { reference, quote } of sources) {
    if (
      !ctx.publication.lesson.references.some((r) => m4Hash(r) === m4Hash(reference)) ||
      reference.sourceRevisionId !== ctx.publication.sourceRevisionId ||
      reference.sourceHash !== ctx.publication.sourceHash
    )
      throw new Error('M5_SOURCE_PIN');
    if (
      !ctx.publication.lesson.excerpts?.some(
        (e) => m4Hash(e.reference) === m4Hash(reference) && e.text.includes(quote),
      )
    )
      throw new Error('M5_UNGROUNDED_QUOTE');
  }
  const added = f.operations.flatMap((o) =>
    o.type === 'add' || o.type === 'connect_elements' ? [o.element] : [],
  );
  const ids = new Set(added.map((e) => e.id));
  if (ids.size !== added.length) throw new Error('M5_DUPLICATE_ELEMENT');
  for (const e of added) {
    if (e.kind === 'allocation') {
      if (f.simulation && m4Hash(e.resource.model) !== m4Hash(f.simulation))
        throw new Error('M5_ALLOCATION_MODEL_PIN');
      runTrustedExperiment(e.resource.model);
    }
    if (e.kind === 'graph') {
      if (!f.graphModel) throw new Error('M5_GRAPH_KERNEL_REQUIRED');
      for (const point of e.points) {
        const output = runTrustedExperiment({ ...f.graphModel, seconds: point.x }).output;
        if (output.requests !== point.y) throw new Error('M5_GRAPH_KERNEL_MISMATCH');
      }
    }
    if (!sources.some((s) => e.sourceId === `source-${s.reference.unitId}`))
      throw new Error('M5_ELEMENT_SOURCE');
    if (
      e.kind === 'edge' &&
      !f.relationships.some(
        (r) =>
          r.from === e.from && r.to === e.to && r.relation === e.relation && r.directionReviewed,
      )
    )
      throw new Error('M5_UNREVIEWED_RELATIONSHIP');
    if (e.kind === 'equation') {
      const step = f.equationSteps.find((s) => s.elementId === e.id);
      if (!step) throw new Error('M5_UNCHECKED_EQUATION');
      validateEquationStep(step);
      const display =
        step.rule === 'floor'
          ? `floor(${step.inputs[0]!.value}) = ${step.result.value} ${step.result.unit}`
          : `${step.inputs[0]!.value} ${step.rule === 'divide' ? '/' : step.rule === 'multiply' ? '*' : step.rule === 'add' ? '+' : '-'} ${step.inputs[1]!.value} = ${step.result.value} ${step.result.unit}`;
      if (e.tex !== display || !e.explanation.includes(step.result.unit))
        throw new Error('M5_EQUATION_DISPLAY_MISMATCH');
    }
  }
  for (const step of f.equationSteps) {
    validateEquationStep(step);
    if (
      !ids.has(step.elementId) ||
      step.corrects === step.id ||
      (step.corrects && !f.equationSteps.some((s) => s.id === step.corrects))
    )
      throw new Error('M5_EQUATION_LINEAGE');
  }
  if (f.simulation) runTrustedExperiment(f.simulation);
  if (f.capability === 'simulation' && !f.simulation) throw new Error('M5_KERNEL_REQUIRED');
  return f;
}
