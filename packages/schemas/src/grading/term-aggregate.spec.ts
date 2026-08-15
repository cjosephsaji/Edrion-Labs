import { describe, expect, it } from 'vitest';
import { presetSnapshot } from './schemes';
import { computeSchemeTermAggregate, computeTermAggregate } from './term-aggregate';

describe('computeSchemeTermAggregate', () => {
  it('credit_weighted GPA', () => {
    const scheme = presetSnapshot('points_10');
    const r = computeSchemeTermAggregate(scheme, [
      { weighted_pct: 80, grade_points: 8, is_pass: true, credits: 4, open_weight_pct: 0 },
      { weighted_pct: 70, grade_points: 7, is_pass: true, credits: 3, open_weight_pct: 0 },
    ]);
    expect(r.termPct).toBe(75);
    expect(r.termGpa).toBe(7.57);
    expect(r.creditsEarned).toBe(7);
    expect(r.isComplete).toBe(true);
  });
});

describe('computeTermAggregate', () => {
  it('entries-based percentage aggregate', () => {
    const r = computeTermAggregate({
      entries: [
        { subjectId: 's1', marksObtained: 80, maxMarks: 100 },
        { subjectId: 's2', marksObtained: 70, maxMarks: 100 },
      ],
      formula: 'none',
    });
    expect(r.percentage).toBe(75);
    expect(r.totalObtained).toBe(150);
    expect(r.standing).toBe('Distinction');
  });
});
