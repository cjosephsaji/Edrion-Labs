/** Client-side mirrors of the portal Assignments DTOs (Phase 6). The API is authoritative. */
import type { Paged } from './academics-types';

export type { Paged };

export type AssignmentStatus = 'draft' | 'published' | 'closed';
export type DeliveryMode = 'file' | 'quiz';
export type SubmissionStatus = 'assigned' | 'submitted' | 'late' | 'graded' | 'missing';

export interface AssignmentRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  title: string;
  classId: string;
  className: string | null;
  subjectId: string | null;
  subjectName: string | null;
  teacherId: string | null;
  teacherName: string | null;
  instructions: string | null;
  dueDate: string | null;
  maxPoints: number;
  status: AssignmentStatus;
  audience: Array<{ kind: string; refId?: string | null }>;
  durationMin: number | null;
  deliveryMode: DeliveryMode;
  submissionCount: number;
  gradedCount: number;
}

export interface AssignmentSubmissionRow {
  id: string;
  institutionId: string;
  assignmentId: string;
  studentId: string;
  studentName: string | null;
  admissionNo: string | null;
  status: SubmissionStatus;
  submittedDate: string | null;
  pointsAwarded: number | null;
  feedback: string | null;
  version: number;
}
