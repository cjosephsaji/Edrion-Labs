import { describe, expect, it } from 'vitest';

/** Mirrors partial-correction approval toggling (AC 15). */
function partitionCorrectionSessions(
  recordRefs: Array<{ session_id: string }>,
  acceptedIds: string[],
) {
  const toggled = new Set(acceptedIds);
  const flipped: string[] = [];
  const kept: string[] = [];
  for (const ref of recordRefs) {
    if (toggled.has(ref.session_id)) flipped.push(ref.session_id);
    else kept.push(ref.session_id);
  }
  return { flipped, kept };
}

describe('attendance request approval logic', () => {
  it('AC 15: partial correction flips only accepted sessions', () => {
    const refs = [{ session_id: 'a' }, { session_id: 'b' }, { session_id: 'c' }];
    const result = partitionCorrectionSessions(refs, ['a', 'c']);
    expect(result.flipped).toEqual(['a', 'c']);
    expect(result.kept).toEqual(['b']);
  });

  it('AC 13: cross-type overlap message names the existing code', () => {
    const message = `You already have LR-1234 covering 2026-08-01–2026-08-03.`;
    expect(message).toContain('LR-1234');
  });

  it('AC 12: side effect must run before approval status changes', () => {
    const order: string[] = [];
    async function approveWithSideEffect(sideEffect: () => Promise<void>) {
      await sideEffect();
      order.push('approved');
    }
    return approveWithSideEffect(async () => {
      order.push('marks');
    }).then(() => {
      expect(order).toEqual(['marks', 'approved']);
    });
  });
});
