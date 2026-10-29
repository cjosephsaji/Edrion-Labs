import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { assessM4Calibration, criticalFalseAcceptanceUpper } from './petros-v2-calibration';
describe('M4 future calibration gate preparation', () => {
  it('does not qualify an empty or controlled-only collection', () => {
    expect(assessM4Calibration([])).toMatchObject({
      engineeringMetricsPass: false,
      responses: 0,
      oneSided95Upper: 1,
    });
  });
  it('counts correlated criteria once per response and keeps correct/incorrect examples disjoint', () => {
    const responseId = randomUUID(),
      subjectId = randomUUID(),
      reviewerReceiptId = randomUUID();
    const labels = [
      { human: 'not_satisfied', evaluated: 'satisfied', critical: true },
      { human: 'not_satisfied', evaluated: 'not_satisfied', critical: true },
      { human: 'satisfied', evaluated: 'satisfied', critical: false },
    ].map((label) => ({
      ...label,
      responseId,
      subjectId,
      reviewerReceiptId,
      criterionId: randomUUID(),
    }));
    expect(assessM4Calibration(labels)).toMatchObject({
      responses: 1,
      correct: 0,
      incorrect: 1,
      criticalIncorrect: 1,
      criticalFalseAcceptance: 1,
      oneSided95Upper: 1,
      engineeringMetricsPass: false,
    });
  });
  it('computes the exact zero-error one-sided bound', () => {
    expect(criticalFalseAcceptanceUpper(0, 200)).toBeCloseTo(1 - Math.pow(0.05, 1 / 200), 12);
    expect(criticalFalseAcceptanceUpper(0, 100)).toBeGreaterThan(0.02);
  });
  it('raises the bound for false acceptances and has no success without a denominator', () => {
    expect(criticalFalseAcceptanceUpper(1, 200)).toBeGreaterThan(
      criticalFalseAcceptanceUpper(0, 200),
    );
    expect(criticalFalseAcceptanceUpper(0, 0)).toBe(1);
  });
});
