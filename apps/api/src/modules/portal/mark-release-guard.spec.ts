import { describe, expect, it } from 'vitest';

const RETRACT_WINDOW_MS = 60 * 60 * 1000;

function canRetract(releasedAt: Date, now = Date.now()) {
  return now - releasedAt.getTime() <= RETRACT_WINDOW_MS;
}

function assertReleaseTransition(from: string, to: string) {
  const allowed: Record<string, string[]> = {
    draft: ['pending_approval', 'released'],
    retracted: ['pending_approval', 'released'],
    pending_approval: ['released', 'draft'],
    released: ['retracted'],
  };
  return (allowed[from] ?? []).includes(to);
}

describe('mark release guards', () => {
  it('AC 10: retract window closes after 60 minutes', () => {
    const releasedAt = new Date(Date.now() - RETRACT_WINDOW_MS - 1);
    expect(canRetract(releasedAt)).toBe(false);
  });

  it('AC 10: retract allowed inside 60 minute window', () => {
    const releasedAt = new Date(Date.now() - 30 * 60 * 1000);
    expect(canRetract(releasedAt)).toBe(true);
  });

  it('AC 2: illegal status transitions rejected', () => {
    expect(assertReleaseTransition('released', 'draft')).toBe(false);
    expect(assertReleaseTransition('draft', 'released')).toBe(true);
    expect(assertReleaseTransition('pending_approval', 'released')).toBe(true);
  });
});
