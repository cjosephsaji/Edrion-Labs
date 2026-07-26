import { timesOverlap } from '@edrion/schemas';

export type TimetableConflictSeverity = 'blocking' | 'warning';

export interface TimetableConflict {
  code: 'TEACHER_CLASH' | 'ROOM_CLASH' | 'QUOTA_EXCEEDED' | 'DUPLICATE_SUBJECT_DAY';
  severity: TimetableConflictSeverity;
  message: string;
}

export interface ConflictSlotInput {
  id?: string;
  classId: string;
  subjectId: string | null;
  teacherId: string | null;
  room: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  subjectName?: string | null;
  teacherName?: string | null;
  className?: string | null;
  weeklyPeriods?: number | null;
}

export function detectTimetableConflicts(
  candidate: ConflictSlotInput,
  peers: ConflictSlotInput[],
): TimetableConflict[] {
  const conflicts: TimetableConflict[] = [];
  const relevant = peers.filter((peer) => peer.id !== candidate.id);

  for (const peer of relevant) {
    if (peer.dayOfWeek !== candidate.dayOfWeek) continue;
    if (!rangesOverlap(candidate, peer)) continue;
    if (!timesOverlap(candidate.startTime, candidate.endTime, peer.startTime, peer.endTime)) continue;

    if (candidate.teacherId && peer.teacherId && candidate.teacherId === peer.teacherId) {
      conflicts.push({
        code: 'TEACHER_CLASH',
        severity: 'blocking',
        message: `${candidate.teacherName ?? 'Teacher'} is already teaching ${peer.className ?? 'another class'} at this time.`,
      });
    }

    const roomA = normalizeRoom(candidate.room);
    const roomB = normalizeRoom(peer.room);
    if (roomA && roomB && roomA === roomB) {
      conflicts.push({
        code: 'ROOM_CLASH',
        severity: 'warning',
        message: `${candidate.room} is used by ${peer.className ?? 'another class'} at this time.`,
      });
    }
  }

  if (candidate.subjectId && candidate.weeklyPeriods) {
    const weeklyCount = relevant.filter(
      (peer) =>
        peer.classId === candidate.classId &&
        peer.subjectId === candidate.subjectId &&
        rangesOverlap(candidate, peer),
    ).length + 1;
    if (weeklyCount > candidate.weeklyPeriods) {
      conflicts.push({
        code: 'QUOTA_EXCEEDED',
        severity: 'warning',
        message: `${candidate.subjectName ?? 'Subject'} has ${weeklyCount} periods this week; quota is ${candidate.weeklyPeriods}.`,
      });
    }
  }

  const sameDay = relevant.filter(
    (peer) =>
      peer.classId === candidate.classId &&
      peer.dayOfWeek === candidate.dayOfWeek &&
      peer.subjectId &&
      candidate.subjectId &&
      peer.subjectId === candidate.subjectId &&
      rangesOverlap(candidate, peer),
  );
  if (sameDay.length > 0) {
    conflicts.push({
      code: 'DUPLICATE_SUBJECT_DAY',
      severity: 'warning',
      message: `${candidate.subjectName ?? 'Subject'} appears twice on this day.`,
    });
  }

  return conflicts;
}

function rangesOverlap(a: ConflictSlotInput, b: ConflictSlotInput): boolean {
  const aFrom = a.effectiveFrom ?? '0001-01-01';
  const aTo = a.effectiveTo ?? '9999-12-31';
  const bFrom = b.effectiveFrom ?? '0001-01-01';
  const bTo = b.effectiveTo ?? '9999-12-31';
  return aFrom <= bTo && bFrom <= aTo;
}

function normalizeRoom(room: string | null): string | null {
  if (!room) return null;
  const trimmed = room.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

export function assertNoBlockingConflicts(conflicts: TimetableConflict[]): void {
  const blocking = conflicts.find((c) => c.severity === 'blocking');
  if (blocking) {
    const error = new Error(blocking.message) as Error & { code: string; conflicts: TimetableConflict[] };
    error.code = blocking.code;
    error.conflicts = conflicts;
    throw error;
  }
}
