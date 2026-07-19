/**
 * UTC-safe ISO date math. Never use Date.parse('YYYY-MM-DD') or toISOString().slice(0,10)
 * for local calendar dates — those shift across timezones.
 */

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

export function startOfMonth(year: number, month: number): Date {
  return new Date(year, month - 1, 1);
}

export function endOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0);
}

export function daysInMonth(year: number, month: number): number {
  return endOfMonth(year, month).getDate();
}

export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function addMonths(iso: string, months: number): string {
  const d = fromISODate(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const dim = daysInMonth(d.getFullYear(), d.getMonth() + 1);
  d.setDate(Math.min(day, dim));
  return toISODate(d);
}

/** Monday-start by default (weekStartsOn: 0=Sun … 6=Sat). */
export function startOfWeek(iso: string, weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 1): string {
  const d = fromISODate(iso);
  const dow = d.getDay();
  const offset = (dow - weekStartsOn + 7) % 7;
  return addDays(iso, -offset);
}

export function addWeeks(iso: string, weeks: number): string {
  return addDays(iso, weeks * 7);
}

export function isSameDay(a: string, b: string): boolean {
  return a === b;
}

export function isToday(iso: string, today = toISODate(new Date())): boolean {
  return iso === today;
}

/** 6×7 matrix of ISO dates for a month grid. weekStartsOn: 0=Sun … 6=Sat (default Mon=1). */
export function monthMatrix(
  year: number,
  month: number,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 1,
): string[][] {
  const first = startOfMonth(year, month);
  const firstDow = first.getDay(); // 0=Sun
  const offset = (firstDow - weekStartsOn + 7) % 7;
  const start = new Date(year, month - 1, 1 - offset);
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: string[] = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      row.push(toISODate(cell));
    }
    weeks.push(row);
  }
  return weeks;
}

export function eachDayInRange(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let cur = startIso;
  while (cur <= endIso) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function minEndDate(startDate: string): string | undefined {
  return startDate || undefined;
}

export function maxStartDate(endDate: string): string | undefined {
  return endDate || undefined;
}

export function isEndAfterStart(startDate: string, endDate: string): boolean {
  return endDate > startDate;
}
