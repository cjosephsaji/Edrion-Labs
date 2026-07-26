/** Client-side mirrors of the portal Exams DTOs (Phase 6). The API is authoritative. */
import type { Paged } from './academics-types';

export type { Paged };

export type ExamType = 'term' | 'midterm' | 'final' | 'unit_test' | 'quiz' | 'practical' | 'mock';
export type ExamStatus = 'draft' | 'scheduled' | 'ongoing' | 'completed' | 'published' | 'cancelled';

export interface ExamRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  name: string;
  examType: ExamType;
  academicYearId: string | null;
  academicYearName: string | null;
  termId: string | null;
  termName: string | null;
  termLabel: string | null;
  startDate: string | null;
  endDate: string | null;
  status: ExamStatus;
  description: string | null;
  audience: Array<{ kind: string; refId?: string | null }>;
  durationMin: number | null;
  scheduleCount: number;
}

export interface ExamScheduleRow {
  id: string;
  institutionId: string;
  examId: string;
  classId: string;
  className: string | null;
  subjectId: string;
  subjectName: string | null;
  examDate: string | null;
  startTime: string | null;
  endTime: string | null;
  maxMarks: number;
  passMarks: number | null;
  room: string | null;
  version: number;
}
