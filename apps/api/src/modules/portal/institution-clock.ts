/**
 * Local wall-clock date/time/weekday for an institution, DST-correct.
 * Uses Intl — never the browser clock. Zero-padded HH:MM compares lexicographically.
 */

export interface InstitutionNow {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  dayOfWeek: number; // 1=Mon … 7=Sun (ISO)
}

const weekdayToIso: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/** Institution timezone changes rarely — cache lookups for a few minutes. */
const TZ_TTL_MS = 5 * 60 * 1000;
const tzCache = new Map<string, { timezone: string; fetchedAt: number }>();

export function getCachedInstitutionTimezone(
  institutionId: string,
  fetch: () => Promise<string>,
): Promise<string> {
  const hit = tzCache.get(institutionId);
  if (hit && Date.now() - hit.fetchedAt < TZ_TTL_MS) {
    return Promise.resolve(hit.timezone);
  }
  return fetch().then((timezone) => {
    const tz = timezone?.trim() || 'UTC';
    tzCache.set(institutionId, { timezone: tz, fetchedAt: Date.now() });
    return tz;
  });
}

/** Drop cached tz after settings update (or pass nothing to clear all). */
export function clearInstitutionTimezoneCache(institutionId?: string): void {
  if (institutionId) tzCache.delete(institutionId);
  else tzCache.clear();
}

export function institutionNow(timezone: string, at = new Date()): InstitutionNow {
  const tz = timezone?.trim() || 'UTC';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23', // NOT hour12:false — that yields "24" at midnight in some engines
  }).formatToParts(at);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  const year = get('year');
  const month = get('month');
  const day = get('day');
  let hour = get('hour');
  const minute = get('minute');
  // Some engines still emit "24" for midnight with hourCycle h23 — normalize.
  if (hour === '24') hour = '00';

  const weekday = get('weekday');
  const dayOfWeek = weekdayToIso[weekday] ?? 1;

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`,
    dayOfWeek,
  };
}

/** Derive timing from zero-padded HH:MM strings (lexicographic compare is correct). */
export function slotTiming(
  nowTime: string,
  startTime: string,
  endTime: string,
): 'past' | 'current' | 'upcoming' {
  if (nowTime < startTime) return 'upcoming';
  if (nowTime >= endTime) return 'past';
  return 'current';
}
