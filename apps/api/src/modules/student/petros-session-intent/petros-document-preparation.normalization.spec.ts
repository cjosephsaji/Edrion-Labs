import { describe, expect, it } from 'vitest';
import { normalizeTeachingDraft } from './petros-document-preparation.service';

describe('document preparation normalization', () => {
  it('repairs only bounded numeric-step strings and removes invalid highlight flags', () => {
    const draft = normalizeTeachingDraft({
      scenes: [
        {
          phase: 'visual_explanation',
          activitySpec: {
            kind: 'numeric_exploration',
            outputs: [{ steps: ['multiply by input', 'add 2', 'evaluate a polynomial'] }],
          },
        },
        {
          phase: 'guided_application',
          activitySpec: {
            kind: 'equation_steps',
            lines: [{ highlight: [true, 'u'], support: 'shown' }],
          },
        },
      ],
    }) as { scenes: Array<{ activitySpec: Record<string, any> }> };

    expect(draft.scenes[0]!.activitySpec.outputs[0].steps).toEqual([
      { operation: 'multiply', operand: { source: 'input' } },
      { operation: 'add', operand: { source: 'constant', value: 2 } },
      'evaluate a polynomial',
    ]);
    expect(draft.scenes[1]!.activitySpec.lines[0].highlight).toEqual(['u']);
  });

  it('assigns v4 instructional roles and conservatively repairs recognized calculus notation', () => {
    const draft = normalizeTeachingDraft({
      scenes: [
        {
          id: 'explain',
          phase: 'concrete_opening',
          responseType: 'choice',
          choices: [{ id: 'revealed', label: 'x^3 + C' }],
          activitySpec: {
            kind: 'equation_steps',
            lines: [
              { id: 'a', expression: 'd/dx(x³) = 3x²' },
              { id: 'b', expression: 'integral 3x² dx = x³ + C' },
            ],
          },
        },
      ],
    }) as { scenes: Array<Record<string, any>> };

    expect(draft.scenes[0]).toMatchObject({
      purpose: 'teaching',
      response: { kind: 'none' },
      responseType: 'explanation',
      choices: [],
    });
    expect(draft.scenes[0]!.activitySpec.lines[0].expression).toBe('\\frac{d}{dx}(x^{3}) = 3x^{2}');
    expect(draft.scenes[0]!.activitySpec.lines[1].expression).toBe('\\int 3x^{2}\\,dx = x^{3} + C');
  });

  it('removes C from an indefinite-integral variable domain', () => {
    const draft = normalizeTeachingDraft({
      scenes: [{
        id: 'check',
        phase: 'independent_check',
        objectiveId: 'integrals',
        responseType: 'explanation',
        response: { kind: 'expression' },
        expectedAnswer: {
          kind: 'expression',
          expression: 'x^3 + C',
          variables: ['x', 'C'],
          domain: { x: { min: -5, max: 5 }, C: { min: -100, max: 100 } },
          allowAdditiveConstant: true,
        },
        activitySpec: { kind: 'equation_steps', lines: [] },
      }],
    }) as { scenes: Array<Record<string, any>> };

    expect(draft.scenes[0]!.expectedAnswer.variables).toEqual(['x']);
    expect(draft.scenes[0]!.expectedAnswer.domain).toEqual({ x: { min: -5, max: 5 } });
  });
});
