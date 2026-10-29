import { describe, expect, it } from 'vitest';
import { fixtureEquationCheckSchema, teachingActionEnvelopeSchema } from './teaching-actions';

import { sampleAction } from './test-fixture';

describe('public fixture teaching action contract', () => {
  it('admits the narrow versioned public action', () => expect(teachingActionEnvelopeSchema.parse(sampleAction).mode).toBe('public_fixture'));
  it.each([{ privateAnswer: 'secret' }, { actor: 'admin' }, { grade: 1 }, { javascript: 'alert(1)' }])('rejects injected authority/private fields %j', extra => {
    expect(() => teachingActionEnvelopeSchema.parse({ ...sampleAction, ...extra })).toThrow();
  });
  it('rejects executable/unsupported operations and raw selectors', () => {
    expect(() => teachingActionEnvelopeSchema.parse({ ...sampleAction, type: 'run_script' })).toThrow();
    expect(() => teachingActionEnvelopeSchema.parse({ ...sampleAction, cue: { ...sampleAction.cue, targetId: '#my-selector' } })).toThrow();
    expect(() => teachingActionEnvelopeSchema.parse({ ...sampleAction, operations: Array(33).fill(sampleAction.operations[0]) })).toThrow();
  });
  it('checks subtraction and nonzero denominator without a symbolic evaluator', () => {
    const valid = { rule: 'slope-substitution', x1: 1, y1: 2, x2: 4, y2: 8, numerator: 6, denominator: 3 };
    expect(fixtureEquationCheckSchema.safeParse(valid).success).toBe(true);
    expect(fixtureEquationCheckSchema.safeParse({ ...valid, numerator: 7 }).success).toBe(false);
    expect(fixtureEquationCheckSchema.safeParse({ ...valid, x2: 1, denominator: 0 }).success).toBe(false);
    expect(() => teachingActionEnvelopeSchema.parse({ ...sampleAction, type: 'transform_equation' })).toThrow();
  });
});
