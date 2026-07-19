/** Client-side mirrors of the portal Timetable DTOs (Phase 5). The API is authoritative. */
import type { Paged } from './academics-types';

export type { Paged };

export interface TimetableSlotRow {
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
  teacherId: string | null;
  teacherName: string | null;
  academicYearId: string | null;
  termId: string | null;
  termName: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label?: string | null;
  kind?: 'teaching' | 'break' | 'lunch';
  room: string | null;
}
