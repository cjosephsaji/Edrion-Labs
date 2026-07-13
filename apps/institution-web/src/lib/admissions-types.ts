/** Client-side mirrors of the portal Admissions DTOs (Phase 5). The API is authoritative. */
import type { Paged } from './academics-types';

export type { Paged };

export type AdmissionStatus =
  | 'submitted'
  | 'under_review'
  | 'info_requested'
  | 'accepted'
  | 'rejected'
  | 'waitlisted'
  | 'enrolled'
  | 'withdrawn';

export type AdmissionSubmittedVia = 'staff' | 'portal';

/** Decision statuses set via the decide action (info_requested keeps the applicant in the pipeline). */
export type AdmissionDecision = 'accepted' | 'rejected' | 'waitlisted' | 'info_requested';

export interface AdmissionRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  applicationNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: string | null;
  dateOfBirth: string | null;
  email: string | null;
  phone: string | null;
  gradeLevelId: string | null;
  gradeLevelName: string | null;
  academicYearId: string | null;
  academicYearName: string | null;
  submittedVia: AdmissionSubmittedVia;
  previousSchool: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  status: AdmissionStatus;
  appliedDate: string | null;
  decisionDate: string | null;
  decisionNote: string | null;
  enrolledStudentId: string | null;
  additionalInfo: AdmissionAdditionalInfo | null;
}

/** Health + additional info collected on the application (parent funnel "Health" step). */
export interface AdmissionAdditionalInfo {
  medicalConditions?: string;
  allergies?: string;
  medications?: string;
  bloodGroup?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  specialNeeds?: string;
  notes?: string;
}
