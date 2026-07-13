/** Shift an ISO date (YYYY-MM-DD) by a number of calendar days. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Earliest valid end date when end must be strictly after start. */
export function minEndDate(startDate: string): string | undefined {
  return startDate ? addDays(startDate, 1) : undefined;
}

/** Latest valid start date when end must be strictly after start. */
export function maxStartDate(endDate: string): string | undefined {
  return endDate ? addDays(endDate, -1) : undefined;
}

export function isEndAfterStart(startDate: string, endDate: string): boolean {
  return !!startDate && !!endDate && endDate > startDate;
}
