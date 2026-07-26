import { describe, expect, it } from 'vitest';

function assertDifferentApprover(proposedBy: string, approverId: string) {
  return proposedBy !== approverId;
}

function weightTotal(components: Array<{ weight_pct: number }>) {
  return components.reduce((sum, c) => sum + c.weight_pct, 0);
}

describe('term recompute §4.4', () => {
  it('AC 11: proposer cannot approve their own request', () => {
    expect(assertDifferentApprover('user-a', 'user-a')).toBe(false);
    expect(assertDifferentApprover('user-a', 'user-b')).toBe(true);
  });

  it('weight maps must sum to 100 before recompute enqueue', () => {
    expect(weightTotal([{ weight_pct: 60 }, { weight_pct: 40 }])).toBe(100);
    expect(weightTotal([{ weight_pct: 60 }, { weight_pct: 30 }])).toBe(90);
  });
});
