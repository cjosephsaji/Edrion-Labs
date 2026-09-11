import { describe, expect, it } from 'vitest';
import { evaluateExpectedMathAnswer, validateExpectedMathAnswer } from './petros-math-evaluator';

describe('Petros restricted mathematics evaluator', () => {
  it('grades numeric answers with explicit units and tolerance', () => {
    const key = { kind: 'numeric' as const, value: 9.81, tolerance: 0.01, unit: 'm/s^2' };
    expect(evaluateExpectedMathAnswer(key, '9.8 m/s^2', 'retry').correctness).toBe('correct');
    expect(evaluateExpectedMathAnswer(key, '9.8 kg', 'retry').correctness).toBe('incorrect');
  });

  it('proves polynomial equivalence symbolically', () => {
    const key = { kind: 'expression' as const, expression: 'x^2 + 2*x + 1', variables: ['x'], domain: { x: { min: -10, max: 10 } }, allowAdditiveConstant: false };
    expect(evaluateExpectedMathAnswer(key, '(x+1)^2', 'expand it').correctness).toBe('correct');
    expect(evaluateExpectedMathAnswer(key, 'x^2+1', 'expand it').correctness).toBe('incorrect');
  });

  it('accepts indefinite antiderivatives only up to an additive constant', () => {
    const key = { kind: 'expression' as const, expression: 'x^3/3', variables: ['x'], domain: { x: { min: -5, max: 5 } }, allowAdditiveConstant: true };
    expect(evaluateExpectedMathAnswer(key, 'x^3/3 + 7', 'differentiate').correctness).toBe('correct');
    expect(evaluateExpectedMathAnswer(key, 'x^3/3 + C', 'differentiate').correctness).toBe('correct');
  });

  it('does not require a numeric domain for a generated integration constant', () => {
    const key = { kind: 'expression' as const, expression: 'x^3 + C', variables: ['x', 'C'], domain: { x: { min: -5, max: 5 } }, allowAdditiveConstant: true };
    expect(validateExpectedMathAnswer(key)).toBe(key);
    expect(evaluateExpectedMathAnswer(key, 'x^3 + 12', 'differentiate').correctness).toBe('correct');
  });

  it('does not accept C outside an antiderivative-family contract', () => {
    const key = { kind: 'expression' as const, expression: 'x^2', variables: ['x'], domain: { x: { min: -5, max: 5 } }, allowAdditiveConstant: false };
    expect(evaluateExpectedMathAnswer(key, 'x^2 + C', 'remove unsupported symbols').correctness).toBe('invalid');
  });

  it('refuses variable denominators instead of relying on numeric sampling', () => {
    const key = { kind: 'expression' as const, expression: '1/x', variables: ['x'], domain: { x: { min: -1, max: 1 } }, allowAdditiveConstant: false };
    expect(() => validateExpectedMathAnswer(key)).toThrow(/domain proof/);
  });
});
