import { describe, expect, it } from 'vitest';
import { resolveTimetable, type ResolverSlot } from '../timetable/resolver';
import {
  computeForecast,
  computeRemainingSessions,
  countAttended,
  excludesFromConductedDenominator,
} from './forecaster';
import { attendancePolicyDefaults } from './policy';
import {
  displayPctMatchesZone,
  formatAttendancePct,
  truncateAttendancePctNumber,
} from './format';

const baseSlot = (overrides: Partial<ResolverSlot> = {}): ResolverSlot => ({
  id: 'slot-1',
  classId: 'class-1',
  subjectId: 'sub-physics',
  subjectName: 'Physics',
  teacherId: 'teacher-1',
  teacherName: 'A. Sharma',
  label: null,
  dayOfWeek: 1,
  startTime: '09:00',
  endTime: '09:45',
  kind: 'teaching',
  room: '214',
  effectiveFrom: null,
  effectiveTo: null,
  termStart: '2026-07-01',
  termEnd: '2026-07-31',
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...overrides,
});

const remainingBase = {
  subjectId: 'sub-physics',
  sectionIds: ['class-1'],
  from: '2026-07-06',
  termEnd: '2026-07-31',
  timezone: 'Asia/Kolkata',
  slots: [baseSlot()],
  holidays: [] as string[],
  exceptions: [],
  workingDaysMask: 63,
  classSubjectTeachers: [],
  term: { id: 'term-1', startDate: '2026-07-01', endDate: '2026-07-31' },
};

describe('computeForecast', () => {
  it('AC7: T=75, A=40, C=46, R=31 yields can-miss branch', () => {
    const result = computeForecast({
      attended: 40,
      conducted: 46,
      remaining: 31,
      thresholdPct: 75,
      safeMarginPct: 5,
    });
    expect(result.branch).toBe('can_miss');
    expect(result.message).toContain('Can miss');
    expect(result.message).toContain('stay ≥75%');
    expect(result.n).toBeGreaterThan(0);
  });

  it('branch 4 when unrecoverable', () => {
    const result = computeForecast({
      attended: 10,
      conducted: 40,
      remaining: 5,
      thresholdPct: 75,
      safeMarginPct: 5,
    });
    expect(result.branch).toBe('unrecoverable');
    expect(result.zone).toBe('unrecoverable');
  });

  it('returns none when conducted is zero', () => {
    const result = computeForecast({
      attended: 0,
      conducted: 0,
      remaining: 10,
      thresholdPct: 75,
      safeMarginPct: 5,
    });
    expect(result.branch).toBe('none');
    expect(result.message).toBe('No sessions yet');
  });
});

describe('formatAttendancePct', () => {
  it('AC9: 74.96% truncates to 74.9%', () => {
    expect(formatAttendancePct(0.7496)).toBe('74.9%');
    expect(truncateAttendancePctNumber(74.96)).toBe(74.9);
  });

  it('display and zone never disagree near threshold', () => {
    for (let bps = 7400; bps <= 7600; bps += 1) {
      const exact = bps / 10000;
      expect(displayPctMatchesZone(exact, 75, 5)).toBe(true);
    }
  });
});

describe('computeRemainingSessions', () => {
  it('AC11: respects term boundary mid-week', () => {
    const result = computeRemainingSessions({
      ...remainingBase,
      from: '2026-07-28',
      termEnd: '2026-07-29',
      slots: [baseSlot({ dayOfWeek: 2 }), baseSlot({ id: 'slot-2', dayOfWeek: 4 })],
    });
    expect(result.count).toBe(1);
    expect(result.occurrences[0]?.date).toBe('2026-07-28');
  });

  it('AC11: skips holiday on slot day', () => {
    const result = computeRemainingSessions({
      ...remainingBase,
      holidays: ['2026-07-06'],
    });
    expect(result.occurrences.some((o) => o.date === '2026-07-06')).toBe(false);
  });

  it('AC11: cancel + extra on same date', () => {
    const result = computeRemainingSessions({
      ...remainingBase,
      from: '2026-07-06',
      termEnd: '2026-07-12',
      exceptions: [
        {
          id: 'cancel-1',
          slotId: 'slot-1',
          classId: 'class-1',
          date: '2026-07-06',
          recurring: false,
          recurringUntil: null,
          type: 'cancelled',
          newRoom: null,
          newTeacherId: null,
          newTeacherName: null,
          subjectId: 'sub-physics',
          subjectName: 'Physics',
          startTime: null,
          endTime: null,
          note: null,
          createdAt: '2026-07-01T00:00:00.000Z',
        },
        {
          id: 'extra-1',
          slotId: null,
          classId: 'class-1',
          date: '2026-07-06',
          recurring: false,
          recurringUntil: null,
          type: 'extra_class',
          newRoom: 'Lab',
          newTeacherId: 'teacher-1',
          newTeacherName: 'A. Sharma',
          subjectId: 'sub-physics',
          subjectName: 'Physics',
          startTime: '14:00',
          endTime: '14:45',
          note: null,
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    });
    expect(result.occurrences.filter((o) => o.date === '2026-07-06')).toHaveLength(1);
  });

  it('AC11: empty slot set returns zero', () => {
    const result = computeRemainingSessions({ ...remainingBase, slots: [] });
    expect(result.count).toBe(0);
  });

  it('AC11/A7: duplicate section ids dedupe occurrences', () => {
    const result = computeRemainingSessions({
      ...remainingBase,
      sectionIds: ['class-1', 'class-1'],
    });
    const direct = computeRemainingSessions({
      ...remainingBase,
      sectionIds: ['class-1'],
    });
    expect(result).toEqual(direct);
  });

  it('A6: matches timetable expander occurrence keys', () => {
    const input = {
      sectionIds: ['class-1'],
      from: '2026-07-06',
      to: '2026-07-31',
      timezone: 'Asia/Kolkata',
      slots: [baseSlot(), baseSlot({ id: 'slot-2', dayOfWeek: 3, subjectId: 'sub-chem' })],
      exceptions: [],
      holidays: [],
      classSubjectTeachers: [],
      term: { id: 'term-1', startDate: '2026-07-01', endDate: '2026-07-31' },
    };
    const timetable = resolveTimetable({ ...input, includeExams: false });
    const remaining = computeRemainingSessions({
      subjectId: 'sub-physics',
      sectionIds: input.sectionIds,
      from: input.from,
      termEnd: input.to,
      timezone: input.timezone,
      slots: input.slots,
      holidays: input.holidays,
      exceptions: input.exceptions,
      workingDaysMask: 63,
      classSubjectTeachers: input.classSubjectTeachers,
      term: input.term,
    });
    const expected = timetable.occurrences
      .filter((o) => o.subject.id === 'sub-physics' && o.state !== 'cancelled')
      .map((o) => `${o.date}:${o.id.split(':')[0]}`);
    const actual = remaining.occurrences.map((o) => `${o.date}:${o.slotId}`);
    expect(actual).toEqual(expected);
  });
});

describe('policy matrix', () => {
  const bases = ['present', 'excluded'] as const;
  const computation = ['conducted', 'scheduled'] as const;

  for (const odBasis of bases) {
    for (const excusedBasis of bases) {
      for (const computationBasis of computation) {
        it(`covers od=${odBasis} excused=${excusedBasis} basis=${computationBasis}`, () => {
          const policy = {
            ...attendancePolicyDefaults,
            odBasis,
            excusedBasis,
            computationBasis,
          };
          expect(countAttended('od', policy)).toBe(odBasis === 'present');
          expect(excludesFromConductedDenominator('excused', policy)).toBe(excusedBasis === 'excluded');
          const forecast = computeForecast({
            attended: 30,
            conducted: 40,
            remaining: 20,
            thresholdPct: 75,
            safeMarginPct: 5,
          });
          expect(forecast.branch).toBeTruthy();
        });
      }
    }
  }

  it('left_early_counts_as present and absent', () => {
    expect(countAttended('left_early', { ...attendancePolicyDefaults, leftEarlyCountsAs: 'present' })).toBe(true);
    expect(countAttended('left_early', { ...attendancePolicyDefaults, leftEarlyCountsAs: 'absent' })).toBe(false);
  });
});
