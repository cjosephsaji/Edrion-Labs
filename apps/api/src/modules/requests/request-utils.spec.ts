import { describe, expect, it } from 'vitest';
import { addWorkingDays, codeSuffix, dateDiffDays, decodeCursor, encodeCursor } from './request-utils';

describe('request utilities', () => {
  it('counts Monday through Saturday and skips Sunday and institution holidays', () => {
    const start = new Date('2026-07-18T10:00:00.000Z'); // Saturday
    const holidays = new Set(['2026-07-20']); // Monday
    expect(addWorkingDays(start, 2, holidays).toISOString()).toBe('2026-07-22T10:00:00.000Z');
  });

  it('measures inclusive leave caps through an exclusive date delta', () => {
    expect(dateDiffDays('2026-07-01', '2026-07-30')).toBe(29);
    expect(dateDiffDays('2026-07-01', '2026-07-31')).toBe(30);
  });

  it('uses the ambiguity-free request-code alphabet', () => {
    const suffix = codeSuffix(Uint8Array.from([0, 1, 2, 3, 4]), 5);
    expect(suffix).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
  });

  it('round-trips keyset cursors and rejects malformed values', () => {
    const cursor = { at: '2026-07-20T00:00:00.000Z', id: 'request-id' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(() => decodeCursor('not-a-cursor')).toThrow();
  });
});
