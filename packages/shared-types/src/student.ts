/** Student portal surface registry — code-defined exposure surfaces. */
export type StudentSurfaceKey =
  | 'fees'
  | 'transport'
  | 'hostel'
  | 'documents'
  | 'requests'
  | 'content'
  | 'exams';

export interface StudentSurfaceDef {
  key: StudentSurfaceKey;
  permissionKey: string;
  featureFlagKey: string;
  label: string;
}

export const STUDENT_SURFACES: readonly StudentSurfaceDef[] = [
  {
    key: 'fees',
    permissionKey: 'student.surface.fees.view',
    featureFlagKey: 'student.surface.fees',
    label: 'Fees',
  },
  {
    key: 'transport',
    permissionKey: 'student.surface.transport.view',
    featureFlagKey: 'student.surface.transport',
    label: 'Transport',
  },
  {
    key: 'hostel',
    permissionKey: 'student.surface.hostel.view',
    featureFlagKey: 'student.surface.hostel',
    label: 'Hostel',
  },
  {
    key: 'documents',
    permissionKey: 'student.surface.documents.view',
    featureFlagKey: 'student.surface.documents',
    label: 'Documents',
  },
  {
    key: 'requests',
    permissionKey: 'student.surface.requests.view',
    featureFlagKey: 'student.surface.requests',
    label: 'My Requests',
  },
  {
    key: 'content',
    permissionKey: 'student.surface.content.view',
    featureFlagKey: 'student.surface.content',
    label: 'Content pages',
  },
  {
    key: 'exams',
    permissionKey: 'student.exams.view',
    featureFlagKey: 'student.surface.exams',
    label: 'Exams',
  },
] as const;

export type StudentPersona = 'school' | 'college' | 'independent';

/** Freshness bucket thresholds (days since last activity on a topic). */
export const FRESHNESS_FRESH_DAYS = 7;
export const FRESHNESS_FADING_DAYS = 21;
