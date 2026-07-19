/** Client-side mirrors of the portal Attendance DTOs (Phase 5). The API is authoritative. */
import type { Paged } from './academics-types';

export type { Paged };

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused' | 'left_early';

export interface AttendanceSessionRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  classId: string;
  className: string | null;
  subjectId: string | null;
  subjectName: string | null;
  date: string;
  period: string;
  slotId?: string | null;
  takenById: string | null;
  takenByName: string | null;
  notes: string | null;
  recordCount: number;
  presentCount: number;
}

export interface AttendanceRecordRow {
  id: string;
  institutionId: string;
  sessionId: string;
  studentId: string;
  studentName: string | null;
  admissionNo: string | null;
  status: AttendanceStatus;
  remarks: string | null;
  version: number;
}

export interface AttendanceAgendaSlot {
  slotId: string;
  periodLabel: string;
  startTime: string;
  endTime: string;
  classId: string;
  className: string | null;
  subjectId: string | null;
  subjectName: string | null;
  teacherId: string | null;
  teacherName: string | null;
  room: string | null;
  timing: 'past' | 'current' | 'upcoming';
  marking: 'unmarked' | 'partial' | 'complete';
  rosterSize: number;
  session: {
    id: string;
    recordCount: number;
    presentCount: number;
    version: number;
  } | null;
}

export interface AttendanceAgendaResponse {
  date: string;
  now: string;
  timezone: string;
  dayOfWeek: number;
  scope: 'mine' | 'all';
  slots: AttendanceAgendaSlot[];
  reason: 'staff_not_linked' | null;
}

export interface OpenAttendanceResult {
  session: AttendanceSessionRow;
  roster: Array<{ id: string; studentName: string | null; admissionNo: string | null }>;
  records: AttendanceRecordRow[];
}
