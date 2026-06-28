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
