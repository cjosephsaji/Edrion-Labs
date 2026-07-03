import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { assertWard } from './guardian-scope.guard';
import type { GuardianContext } from './guardian-context';
import { resolveChannels, inQuietHours } from './channel-resolution';
import { ParentDigestService, type DigestModel } from './parent-digest.service';

const guardian: GuardianContext = {
  guardianUserId: 'g1',
  institutionId: 'i1',
  studentIds: ['s1', 's2'],
  students: [
    { studentId: 's1', campusId: 'c1', hidden: {} },
    { studentId: 's2', campusId: 'c1', hidden: { fees: true } },
  ],
};

describe('assertWard (guardian scope)', () => {
  it('returns the ward scope for a linked student', () => {
    expect(assertWard(guardian, 's1').studentId).toBe('s1');
  });
  it('throws for a student the caller does not guard', () => {
    expect(() => assertWard(guardian, 'other')).toThrow(ForbiddenException);
  });
  it('throws when the requested section is hidden for this guardian', () => {
    expect(() => assertWard(guardian, 's2', 'fees')).toThrow(ForbiddenException);
  });
  it('allows a non-hidden section on a restricted ward', () => {
    expect(assertWard(guardian, 's2', 'health').studentId).toBe('s2');
  });
});

describe('resolveChannels (fanout preferences + quiet hours)', () => {
  const noon = new Date('2026-07-03T12:00:00');
  const midnight = new Date('2026-07-03T23:30:00');
  const base = { email: true, push: true, sms: false, whatsapp: false };

  it('dispatches enabled channels outside quiet hours', () => {
    expect(resolveChannels(base, {}, {}, 'fee_overdue', false, noon).sort()).toEqual(['email', 'push']);
  });
  it('suppresses non-critical events during quiet hours', () => {
    expect(resolveChannels(base, {}, { start: '22:00', end: '07:00' }, 'fee_overdue', false, midnight)).toEqual([]);
  });
  it('always delivers a medical incident during quiet hours', () => {
    const out = resolveChannels(base, {}, { start: '22:00', end: '07:00' }, 'medical_incident', true, midnight);
    expect(out).toContain('email');
    expect(out).toContain('push');
  });
  it('always delivers an emergency broadcast even by category alone', () => {
    const out = resolveChannels(base, {}, { start: '22:00', end: '07:00' }, 'emergency_broadcast', false, midnight);
    expect(out).toContain('email');
  });
  it('honors a per-category channel override', () => {
    const out = resolveChannels(base, { fee_overdue: { email: false, sms: true } }, {}, 'fee_overdue', false, noon).sort();
    expect(out).toEqual(['push', 'sms']);
  });
  it('detects overnight quiet-hours windows', () => {
    expect(inQuietHours({ start: '22:00', end: '07:00' }, new Date('2026-07-03T02:00:00'))).toBe(true);
    expect(inQuietHours({ start: '22:00', end: '07:00' }, new Date('2026-07-03T12:00:00'))).toBe(false);
  });
});

describe('ParentDigestService.render (pure)', () => {
  const emptyChild = {
    studentName: 'Nithya',
    attendancePct: 100,
    unexplainedAbsences: 0,
    assignments: { upcoming: 0, missed: 0 },
    newResults: 0,
    recognitions: [] as string[],
    healthVisits: 0,
    behaviorItems: 0,
    feesDueMinor: 0,
    libraryOverdue: 0,
    documentsPublished: 0,
    prompt: null,
  };

  it('renders the all-good variant when nothing needs attention', () => {
    const model: DigestModel = { guardianName: 'Anita', window: { from: '2026-06-26', to: '2026-07-03' }, children: [emptyChild], upcoming: { calendar: 0, ptm: false, pendingConsents: 0 }, allGood: true };
    expect(ParentDigestService.render(model).subject).toContain('all good');
  });

  it('renders per-child sections and omits empty ones', () => {
    const model: DigestModel = {
      guardianName: 'Anita',
      window: { from: '2026-06-26', to: '2026-07-03' },
      children: [{ ...emptyChild, recognitions: ['Maths Olympiad — Gold'], feesDueMinor: 450000, prompt: 'Celebrate Nithya’s Maths Olympiad — Gold! 🎉' }],
      upcoming: { calendar: 0, ptm: true, pendingConsents: 1 },
      allGood: false,
    };
    const { text } = ParentDigestService.render(model);
    expect(text).toContain('Nithya');
    expect(text).toContain('Maths Olympiad — Gold');
    expect(text).toContain('₹4500.00');
    expect(text).toContain('consent(s) awaiting');
    expect(text).not.toContain('behaviour note'); // empty section omitted
  });
});
