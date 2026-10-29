import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  initialSharedCanvas,
  type TeachingFragment,
  type M4Evaluation,
  type M4Response,
} from '@edrion/schemas';
import { completedEquationSteps } from './petros-teaching-actions';
function fixture() {
  const unitId = randomUUID(),
    responseId = randomUUID();
  const fragment = {
    reference: { unitId },
    workBindings: [{ elementId: 'available-step', field: 'available-field' }],
    equationSteps: [{ elementId: 'available-step', result: { value: 48, unit: 'GB' } }],
  } as unknown as TeachingFragment;
  const canvas = initialSharedCanvas('activity');
  canvas.elements = [
    {
      id: 'available-step',
      kind: 'equation',
      sourceId: `source-${unitId}`,
      version: 1,
      label: 'Memory',
      editable: true,
      tex: '64 - 16 = 48 GB',
      explanation: 'Available memory in GB',
      value: '48',
    },
  ];
  const response = {
    id: responseId,
    response: { kind: 'structured', values: { 'available-field': 48 } } as M4Response,
  };
  const evaluation = {
    id: randomUUID(),
    responseId,
    status: 'evaluated',
    criteria: [
      {
        criterionId: randomUUID(),
        label: 'Available',
        origin: 'trusted_kernel',
        status: 'satisfied',
        feedback: 'Checked',
        target: { fieldId: 'available-field' },
      },
    ],
    evaluatorVersion: 'petros.m4.kernel.v1',
    supersedes: null,
    reason: null,
  } as M4Evaluation;
  const revealed = new Set(['available-step']);
  return { fragment, canvas, response, evaluation, revealed };
}
describe('Source-bound, server-projected completion summaries', () => {
  it('uses the reviewed field binding rather than guessing from an element ID', () => {
    const f = fixture();
    expect(
      completedEquationSteps(f.fragment, f.canvas, f.revealed, f.response, f.evaluation),
    ).toEqual(['available-step']);
  });
  it('does not collapse an unrevealed step', () => {
    const f = fixture();
    expect(
      completedEquationSteps(f.fragment, f.canvas, new Set(), f.response, f.evaluation),
    ).toEqual([]);
  });
  it('does not reuse a result from a different submission', () => {
    const f = fixture();
    f.evaluation.responseId = randomUUID();
    expect(
      completedEquationSteps(f.fragment, f.canvas, f.revealed, f.response, f.evaluation),
    ).toEqual([]);
  });
  it('keeps a changed student value open', () => {
    const f = fixture();
    const e = f.canvas.elements[0]!;
    if (e.kind === 'equation') e.value = '49';
    expect(
      completedEquationSteps(f.fragment, f.canvas, f.revealed, f.response, f.evaluation),
    ).toEqual([]);
  });
  it('keeps an example with different checked quantities open despite surviving IDs', () => {
    const f = fixture();
    f.fragment.equationSteps[0]!.result.value = 64;
    expect(
      completedEquationSteps(f.fragment, f.canvas, f.revealed, f.response, f.evaluation),
    ).toEqual([]);
  });
  it('rejects stale sources, uncertain outcomes and unmapped criteria as completion evidence', () => {
    for (const scenario of ['source', 'unavailable', 'review', 'mapping']) {
      const f = fixture();
      if (scenario === 'source') f.canvas.elements[0]!.sourceId = 'foreign-source';
      if (scenario === 'unavailable') f.evaluation.status = 'invalidated';
      if (scenario === 'review') {
        f.evaluation.criteria[0]!.origin = 'review_required';
        f.evaluation.criteria[0]!.status = 'abstained';
      }
      if (scenario === 'mapping') f.evaluation.criteria[0]!.target = { fieldId: 'unrelated-field' };
      expect(
        completedEquationSteps(f.fragment, f.canvas, f.revealed, f.response, f.evaluation),
      ).toEqual([]);
    }
  });
});
