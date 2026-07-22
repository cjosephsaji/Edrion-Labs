/** Truncate to one decimal place — never round up across the threshold. */
export function truncateAttendancePctNumber(percentValue: number): number {
  return Math.trunc(percentValue * 10) / 10;
}

export function formatAttendancePct(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null;
  const pct = value <= 1 ? value * 100 : value;
  return `${truncateAttendancePctNumber(pct).toFixed(1)}%`;
}

export function attendanceZoneForPct(
  pct: number,
  thresholdPct: number,
  safeMarginPct: number,
): 'safe' | 'warning' | 'below' {
  const threshold = thresholdPct / 100;
  const margin = safeMarginPct / 100;
  if (pct >= threshold + margin) return 'safe';
  if (pct >= threshold) return 'warning';
  return 'below';
}

export function displayPctMatchesZone(
  exactPct: number,
  thresholdPct: number,
  safeMarginPct: number,
): boolean {
  const displayed = truncateAttendancePctNumber(exactPct * 100);
  const zone = attendanceZoneForPct(exactPct, thresholdPct, safeMarginPct);
  const boundaryPct = zone === 'safe' ? thresholdPct + safeMarginPct : thresholdPct;
  if (displayed === boundaryPct) {
    return exactPct * 100 >= boundaryPct;
  }
  return true;
}
