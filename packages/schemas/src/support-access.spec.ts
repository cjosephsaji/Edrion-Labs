import { describe, expect, it } from 'vitest';
import {
  computeExpiry,
  computeExtendedExpiry,
  endSupportSessionSchema,
  extendSupportSessionSchema,
  isSessionExpired,
  secondsUntilExpiry,
  startSupportSessionSchema,
} from './support-access';

const INSTITUTION_ID = '11111111-1111-1111-1111-111111111111';

describe('support-access schemas', () => {
  it('defaults access level and duration on start', () => {
    const parsed = startSupportSessionSchema.parse({
      institutionId: INSTITUTION_ID,
      reason: 'Investigate failed billing run',
    });
    expect(parsed.accessLevel).toBe('support');
    expect(parsed.durationMinutes).toBe(60);
  });

  it('rejects too-short reasons and out-of-range durations', () => {
    expect(() =>
      startSupportSessionSchema.parse({ institutionId: INSTITUTION_ID, reason: 'no' }),
    ).toThrow();
    expect(() =>
      startSupportSessionSchema.parse({
        institutionId: INSTITUTION_ID,
        reason: 'Valid reason here',
        durationMinutes: 5,
      }),
    ).toThrow();
    expect(() =>
      startSupportSessionSchema.parse({
        institutionId: INSTITUTION_ID,
        reason: 'Valid reason here',
        durationMinutes: 999,
      }),
    ).toThrow();
  });

  it('requires a reason to extend but not to end', () => {
    expect(() => extendSupportSessionSchema.parse({ addMinutes: 30, reason: 'more' })).toThrow();
    expect(extendSupportSessionSchema.parse({ addMinutes: 30, reason: 'Need more time' })).toMatchObject({
      addMinutes: 30,
    });
    expect(endSupportSessionSchema.parse({})).toEqual({});
  });
});

describe('session-time helpers', () => {
  const start = new Date('2026-06-26T10:00:00.000Z');

  it('computes a hard expiry from duration', () => {
    expect(computeExpiry(start, 60).toISOString()).toBe('2026-06-26T11:00:00.000Z');
  });

  it('extends from the later of current expiry or now, never shortening', () => {
    const expiresAt = new Date('2026-06-26T11:00:00.000Z');
    // now is before expiry → anchor on expiry
    const fromExpiry = computeExtendedExpiry(expiresAt, 30, new Date('2026-06-26T10:30:00.000Z'));
    expect(fromExpiry.toISOString()).toBe('2026-06-26T11:30:00.000Z');
    // now is past expiry → anchor on now (don't resurrect into the past)
    const fromNow = computeExtendedExpiry(expiresAt, 30, new Date('2026-06-26T12:00:00.000Z'));
    expect(fromNow.toISOString()).toBe('2026-06-26T12:30:00.000Z');
  });

  it('detects expiry and counts down', () => {
    const expiresAt = new Date('2026-06-26T11:00:00.000Z');
    expect(isSessionExpired(expiresAt, new Date('2026-06-26T10:59:59.000Z'))).toBe(false);
    expect(isSessionExpired(expiresAt, new Date('2026-06-26T11:00:00.000Z'))).toBe(true);
    expect(secondsUntilExpiry(expiresAt, new Date('2026-06-26T10:59:00.000Z'))).toBe(60);
    expect(secondsUntilExpiry(expiresAt, new Date('2026-06-26T11:30:00.000Z'))).toBe(0);
  });
});
