import { describe, expect, it } from 'vitest';
import { presetSnapshot } from './schemes';
import { computeTermAggregate } from './term-aggregate';

describe('computeTermAggregate', () => {
  it('credit_weighted GPA', () => {
    const scheme = presetSnapshot('points_10');
    const r = computeTermAggregate(scheme, [
      { weighted_pct: 80, grade_points: 8, is_pass: true, credits: 4, open_weight_pct: 0 },
      { weighted_pct: 70, grade_points: 7, is_pass: true, credits: 3, open_weight_pct: 0 },
    ]);
    expect(r.termPct).toBe(75);
    expect(r.termGpa).toBe(7.57);
    expect(r.creditsEarned).toBe(7);
    expect(r.isComplete).toBe(true);
  });
});
