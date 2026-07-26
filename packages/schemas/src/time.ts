/**
 * Shared clock-time helpers for bell schedules and timetable grids.
 * Pure functions — safe for API and web.
 */

export interface ClockTimeParts {
  hours: number;
  minutes: number;
  period: 'AM' | 'PM';
  /** e.g. "9:00" or "10:40" */
  clock: string;
}

export function parseClockTime(time: string): ClockTimeParts {
  const [h = 0, m = 0] = time.split(':').map(Number);
  const hours = h % 12 === 0 ? 12 : h % 12;
  return {
    hours,
    minutes: m,
    period: h >= 12 ? 'PM' : 'AM',
    clock: `${hours}:${String(m).padStart(2, '0')}`,
  };
}

export function minutesBetween(start: string, end: string): number {
  const [sh = 0, sm = 0] = start.split(':').map(Number);
  const [eh = 0, em = 0] = end.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [h = 0, m = 0] = time.split(':').map(Number);
  const total = Math.min(20 * 60, Math.max(0, h * 60 + m + minutes));
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

/** Keep the same period length when the start time changes. */
export function adjustEndForStart(startTime: string, prevStart: string, prevEnd: string): string {
  const duration = Math.max(5, minutesBetween(prevStart, prevEnd));
  let endTime = addMinutesToTime(startTime, duration);
  if (endTime <= startTime) {
    endTime = addMinutesToTime(startTime, 45);
  }
  return endTime;
}

export function sortPeriodsByStart<T extends { startTime: string; endTime: string }>(periods: T[]): T[] {
  return [...periods].sort((a, b) =>
    a.startTime === b.startTime
      ? a.endTime.localeCompare(b.endTime)
      : a.startTime.localeCompare(b.startTime),
  );
}

/** Alias matching the web helper name. */
export const sortPeriods = sortPeriodsByStart;
