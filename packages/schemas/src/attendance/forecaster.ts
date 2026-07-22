import {
  resolveTimetable,
  type ResolverClassSubjectTeacher,
  type ResolverException,
  type ResolverSlot,
  type ResolverTerm,
} from '../timetable/resolver';
import type { AttendancePolicyValues } from './policy';
import type { AttendanceForecast } from './policy';
import { attendanceZoneForPct } from './format';

export type AttendanceMarkStatus =
  | 'present'
  | 'absent'
  | 'late'
  | 'excused'
  | 'left_early'
  | 'od';

export interface RemainingSessionsInput {
  subjectId: string;
  sectionIds: string[];
  from: string;
  termEnd: string;
  timezone: string;
  slots: ResolverSlot[];
  holidays: string[];
  exceptions: ResolverException[];
  workingDaysMask: number;
  classSubjectTeachers: ResolverClassSubjectTeacher[];
  term: ResolverTerm | null;
}

export interface RemainingOccurrence {
  date: string;
  slotId: string;
}

export interface RemainingSessionsResult {
  count: number;
  occurrences: RemainingOccurrence[];
}

export interface ForecastInputs {
  attended: number;
  conducted: number;
  remaining: number;
  thresholdPct: number;
  safeMarginPct: number;
}

export interface ForecastResult extends AttendanceForecast {
  zone: 'safe' | 'warning' | 'below' | 'unrecoverable';
  message: string;
  currentPct: number | null;
}

export interface SessionMark {
  status: AttendanceMarkStatus;
  marked: boolean;
  cancelled?: boolean;
}

export function computeRemainingSessions(input: RemainingSessionsInput): RemainingSessionsResult {
  const sectionIds = [...new Set(input.sectionIds)];
  const holidayRanges = input.holidays.map((date) => ({ startsOn: date, endsOn: date }));
  const { occurrences } = resolveTimetable({
    sectionIds,
    from: input.from,
    to: input.termEnd,
    timezone: input.timezone,
    slots: input.slots,
    exceptions: input.exceptions,
    holidays: holidayRanges,
    classSubjectTeachers: input.classSubjectTeachers,
    term: input.term,
    includeExams: false,
  });

  const seen = new Set<string>();
  const result: RemainingOccurrence[] = [];

  for (const occ of occurrences) {
    if (occ.state === 'cancelled') continue;
    if (input.subjectId && occ.subject.id !== input.subjectId) continue;
    if (!matchesWorkingDayMask(occ.date, input.workingDaysMask, input.timezone)) continue;
    const slotId = occ.id.split(':')[0] ?? '';
    const key = `${occ.date}:${slotId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ date: occ.date, slotId });
  }

  return { count: result.length, occurrences: result };
}

export function countAttended(status: AttendanceMarkStatus, policy: AttendancePolicyValues): boolean {
  if (status === 'present') return true;
  if (status === 'late') return policy.lateCountsAs === 'present';
  if (status === 'left_early') return policy.leftEarlyCountsAs === 'present';
  if (status === 'od') return policy.odBasis === 'present';
  if (status === 'excused') return policy.excusedBasis === 'present';
  return false;
}

export function countsTowardConducted(
  mark: SessionMark,
  policy: AttendancePolicyValues,
): boolean {
  if (mark.cancelled) return false;
  if (policy.computationBasis === 'scheduled') return true;
  return mark.marked;
}

export function excludesFromConductedDenominator(
  status: AttendanceMarkStatus,
  policy: AttendancePolicyValues,
): boolean {
  if (status === 'excused' && policy.excusedBasis === 'excluded') return true;
  if (status === 'od' && policy.odBasis === 'excluded') return true;
  return false;
}

export function computeForecast(input: ForecastInputs): ForecastResult {
  const { attended: A, conducted: C, remaining: R } = input;
  const T = input.thresholdPct / 100;

  if (C <= 0) {
    return {
      branch: 'none',
      n: 0,
      zone: 'safe',
      message: 'No sessions yet',
      currentPct: null,
    };
  }

  const currentPct = A / C;
  const totalDenominator = C + R;

  if (A + R < T * totalDenominator) {
    return {
      branch: 'unrecoverable',
      n: 0,
      zone: 'unrecoverable',
      message: `${input.thresholdPct}% not reachable this term — talk to your advisor.`,
      currentPct,
    };
  }

  const recoveryK = Math.max(0, Math.ceil((T * C - A) / (1 - T)));

  if (currentPct >= T) {
    const rawMiss = Math.floor((A + R - T * totalDenominator) / (1 - T));
    const m = Math.max(0, Math.min(R, rawMiss));
    if (m > 0) {
      return {
        branch: 'can_miss',
        n: m,
        zone: attendanceZoneForPct(currentPct, input.thresholdPct, input.safeMarginPct),
        message: `Can miss ${m} more and stay ≥${input.thresholdPct}%.`,
        currentPct,
      };
    }
    if (recoveryK <= 3) {
      return {
        branch: 'edge',
        n: recoveryK,
        zone: attendanceZoneForPct(currentPct, input.thresholdPct, input.safeMarginPct),
        message: `Attend the next ${recoveryK} to stay safe.`,
        currentPct,
      };
    }
    return {
      branch: 'edge',
      n: recoveryK,
      zone: attendanceZoneForPct(currentPct, input.thresholdPct, input.safeMarginPct),
      message: `Attend the next ${recoveryK} to stay safe.`,
      currentPct,
    };
  }

  if (recoveryK <= R) {
    return {
      branch: 'recovery',
      n: recoveryK,
      zone: 'below',
      message: `Attend the next ${recoveryK} in a row to get back to ${input.thresholdPct}%.`,
      currentPct,
    };
  }

  return {
    branch: 'unrecoverable',
    n: 0,
    zone: 'unrecoverable',
    message: `${input.thresholdPct}% not reachable this term — talk to your advisor.`,
    currentPct,
  };
}

function matchesWorkingDayMask(date: string, mask: number, timezone: string): boolean {
  const day = weekdayForDate(date, timezone);
  return (mask & (1 << day)) !== 0;
}

function weekdayForDate(date: string, timezone: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const anchor = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
  const label = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(anchor);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[label] ?? anchor.getUTCDay();
}
