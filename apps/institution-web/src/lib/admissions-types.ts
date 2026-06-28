/** Client-side mirrors of the portal Admissions DTOs (Phase 5). The API is authoritative. */
import type { Paged } from './academics-types';

export type { Paged };

export type AdmissionStatus =
  | 'submitted'
  | 'under_review'
  | 'accepted'
  | 'rejected'
  | 'waitlisted'
  | 'enrolled'
  | 'withdrawn';

export interface AdmissionRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  applicationNo: string;
  firstName: string;
  lastName: string;
  gender: string | null;
  dateOfBirth: string | null;
  email: string | null;
  phone: string | null;
  gradeLevelId: string | null;
  gradeLevelName: string | null;
  previousSchool: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  status: AdmissionStatus;
  appliedDate: string | null;
  decisionDate: string | null;
  decisionNote: string | null;
  enrolledStudentId: string | null;
}
