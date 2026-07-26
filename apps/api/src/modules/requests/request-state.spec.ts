import { describe, expect, it } from 'vitest';
import { assertRequestTransition, canStudentCancel } from './request-state';

describe('request state machine', () => {
  it.each([
    ['submitted', 'in_review'],
    ['submitted', 'cancelled'],
    ['in_review', 'needs_info'],
    ['needs_info', 'in_review'],
    ['needs_info', 'expired'],
    ['approved', 'fulfilled'],
  ])('allows %s → %s', (from, to) => {
    expect(() => assertRequestTransition(from, to)).not.toThrow();
  });

  it.each([
    ['cancelled', 'approved'],
    ['rejected', 'in_review'],
    ['fulfilled', 'approved'],
  ])('rejects terminal transition %s → %s', (from, to) => {
    expect(() => assertRequestTransition(from, to)).toThrowError(
      expect.objectContaining({ response: expect.objectContaining({ code: 'ILLEGAL_TRANSITION' }) }),
    );
  });

  it('allows cancellation only before a reviewer claims an allowed state', () => {
    const allowed = ['submitted', 'needs_info'] as const;
    expect(canStudentCancel('submitted', null, allowed)).toBe(true);
    expect(canStudentCancel('needs_info', null, allowed)).toBe(true);
    expect(canStudentCancel('submitted', 'reviewer-id', allowed)).toBe(false);
    expect(canStudentCancel('in_review', null, allowed)).toBe(false);
  });
});
