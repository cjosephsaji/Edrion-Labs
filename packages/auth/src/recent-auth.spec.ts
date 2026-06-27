import { describe, expect, it } from 'vitest';
import { isRecentAuth, recentAuthRemaining } from './recent-auth';

const now = new Date('2026-06-26T12:00:00.000Z');

describe('isRecentAuth', () => {
  it('is false with no prior auth', () => {
    expect(isRecentAuth(null, 900, now)).toBe(false);
  });

  it('is true within the window', () => {
    const last = new Date(now.getTime() - 300_000); // 5 min ago
    expect(isRecentAuth(last, 900, now)).toBe(true);
  });

  it('is false past the window', () => {
    const last = new Date(now.getTime() - 1_000_000); // ~16 min ago
    expect(isRecentAuth(last, 900, now)).toBe(false);
  });

  it('remaining counts down and floors at 0', () => {
    const last = new Date(now.getTime() - 300_000);
    expect(recentAuthRemaining(last, 900, now)).toBe(600);
    expect(recentAuthRemaining(new Date(now.getTime() - 1_000_000), 900, now)).toBe(0);
  });
});
