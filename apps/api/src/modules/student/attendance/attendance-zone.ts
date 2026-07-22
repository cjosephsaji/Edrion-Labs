const ZONE_RANK: Record<string, number> = {
  safe: 4,
  warning: 3,
  below: 2,
  unrecoverable: 1,
};

/** True when the student moved into a worse attendance zone (downward crossing). */
export function isDownwardZoneCrossing(priorZone: string | null, nextZone: string): boolean {
  if (!priorZone) return false;
  return (ZONE_RANK[nextZone] ?? 0) < (ZONE_RANK[priorZone] ?? 0);
}

/** Stable feed dedupe key — one nudge per student/subject/term/zone/calendar day. */
export function attendanceZoneEventKey(
  studentId: string,
  subjectId: string | null,
  termId: string,
  zone: string,
  date: string,
): string {
  return `attn:${studentId}:${subjectId ?? 'overall'}:${termId}:${zone}:${date}`;
}

/** Today ribbon id format (A11). */
export function attendanceRibbonId(subjectId: string, zone: string): string {
  return `institution:attendance:${subjectId}:${zone}`;
}

/** Compare rollup rows for rebuild idempotency (AC 22). */
export function rollupSnapshotKey(row: {
  studentId: string;
  subjectId: string | null;
  termId: string;
  attended: number;
  conducted: number;
  remaining: number;
  pct: string | null;
  zone: string;
  forecast: { branch: string; n: number };
}): string {
  return JSON.stringify({
    studentId: row.studentId,
    subjectId: row.subjectId,
    termId: row.termId,
    attended: row.attended,
    conducted: row.conducted,
    remaining: row.remaining,
    pct: row.pct,
    zone: row.zone,
    forecast: row.forecast,
  });
}
