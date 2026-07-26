import { describe, expect, it } from 'vitest';
import { applyMasteryUpdate, expectedProbability } from './mastery-engine';

describe('mastery-engine', () => {
  it('computes expected probability', () => {
    expect(expectedProbability(800, 1300)).toBeCloseTo(0.0532, 3);
  });

  it('increases rating on correct answer', () => {
    const next = applyMasteryUpdate(
      { rating: 800, attempts: 0, correctWeight: 0 },
      'medium',
      'correct',
    );
    expect(next.rating).toBeGreaterThan(800);
    expect(next.attempts).toBe(1);
  });

  it('uses half K on hinted correct', () => {
    const plain = applyMasteryUpdate(
      { rating: 800, attempts: 0, correctWeight: 0 },
      'medium',
      'correct',
    );
    const hinted = applyMasteryUpdate(
      { rating: 800, attempts: 0, correctWeight: 0 },
      'medium',
      'hinted_correct',
    );
    expect(hinted.rating).toBeLessThan(plain.rating);
  });

  it('clamps rating to 400..2400', () => {
    const low = applyMasteryUpdate(
      { rating: 400, attempts: 20, correctWeight: 0 },
      'hard',
      'incorrect',
    );
    expect(low.rating).toBeGreaterThanOrEqual(400);
  });
});
