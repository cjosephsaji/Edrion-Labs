import { describe, expect, it } from 'vitest';
import { institutionNow, slotTiming } from './institution-clock';

describe('institutionNow', () => {
  it('returns UTC wall clock for UTC institutions', () => {
    // 2026-07-16T12:30:00.000Z
    const at = new Date(Date.UTC(2026, 6, 16, 12, 30, 0));
    const now = institutionNow('UTC', at);
    expect(now.date).toBe('2026-07-16');
    expect(now.time).toBe('12:30');
    expect(now.dayOfWeek).toBe(4); // Thursday
  });

  it('handles Asia/Kolkata (+05:30)', () => {
    // 2026-07-16T18:30:00Z = 2026-07-17 00:00 IST
    const at = new Date(Date.UTC(2026, 6, 16, 18, 30, 0));
    const now = institutionNow('Asia/Kolkata', at);
    expect(now.date).toBe('2026-07-17');
    expect(now.time).toBe('00:00');
    expect(now.dayOfWeek).toBe(5); // Friday
  });

  it('normalizes midnight hour', () => {
    const at = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
    const now = institutionNow('UTC', at);
    expect(now.time).toBe('00:00');
    expect(now.date).toBe('2026-01-01');
  });

  it('handles a DST-observing zone (America/New_York)', () => {
    // 2026-03-08 07:00 UTC = 02:00 EST (before spring-forward) — actually EDT starts Mar 8 2026 2am→3am
    // Use a clear summer EDT time: 2026-07-16 16:00 UTC = 12:00 EDT
    const at = new Date(Date.UTC(2026, 6, 16, 16, 0, 0));
    const now = institutionNow('America/New_York', at);
    expect(now.date).toBe('2026-07-16');
    expect(now.time).toBe('12:00');
  });

  it('falls back to UTC for empty timezone', () => {
    const at = new Date(Date.UTC(2026, 6, 16, 12, 0, 0));
    const now = institutionNow('', at);
    expect(now.time).toBe('12:00');
  });
});

describe('slotTiming', () => {
  it('classifies past / current / upcoming via string compare', () => {
    expect(slotTiming('09:00', '09:45', '10:30')).toBe('upcoming');
    expect(slotTiming('10:00', '09:45', '10:30')).toBe('current');
    expect(slotTiming('10:30', '09:45', '10:30')).toBe('past');
    expect(slotTiming('11:00', '09:45', '10:30')).toBe('past');
  });
});
