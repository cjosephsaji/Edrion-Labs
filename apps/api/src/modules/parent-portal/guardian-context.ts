/**
 * The guardian context attached by GuardianScopeGuard after InstitutionAuthGuard. Services take this
 * — never a client-supplied student id — as the source of truth for which wards the caller may reach.
 */
export interface GuardianStudentScope {
  studentId: string;
  campusId: string | null;
  /** Sections hidden for this guardian for this ward (from student_guardians.visibility_overrides). */
  hidden: Record<string, boolean>;
}

export interface GuardianContext {
  guardianUserId: string;
  institutionId: string;
  /** Every ward the caller is an active guardian of. */
  studentIds: string[];
  students: GuardianStudentScope[];
}
