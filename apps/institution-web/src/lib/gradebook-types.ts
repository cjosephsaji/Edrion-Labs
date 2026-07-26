/** Client-side mirrors of the portal Gradebook DTOs (Phase 6). The API is authoritative. */
import type { Paged } from './academics-types';

export type { Paged };

export interface GradeEntryRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  studentId: string;
  studentName: string | null;
  admissionNo: string | null;
  subjectId: string;
  subjectName: string | null;
  examId: string | null;
  examName: string | null;
  classId: string | null;
  assessmentName: string;
  marksObtained: number;
  maxMarks: number;
  letterGrade: string | null;
  remarks: string | null;
}
