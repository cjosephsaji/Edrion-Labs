import type { EvaluatedPermissions } from '@edrion/permissions';

/**
 * The authenticated platform employee for a request. Built by the API's auth layer from the
 * Supabase session + DB role assignments, then attached to the request. Carries the evaluated
 * permission set so guards and services check the same authoritative result.
 */
export interface EmployeePrincipal {
  employeeId: string;
  email: string;
  fullName: string;
  roleKeys: string[];
  permissions: EvaluatedPermissions;
  mfaEnrolled: boolean;
  /** When the employee last completed a full/MFA authentication. Drives recent-auth checks. */
  lastAuthAt: Date | null;
}

/** Support-access session context attached when an employee is inside an institution portal. */
export interface SupportAccessContext {
  sessionId: string;
  institutionId: string;
  institutionName: string;
  reason: string;
  caseRef?: string;
  expiresAt: Date;
  accessLevel: string;
}

/** The full per-request principal context. */
export interface PrincipalContext {
  principal: EmployeePrincipal;
  support?: SupportAccessContext;
  /**
   * The server session id backing this request (cookie auth). Absent on the dev-header path.
   * Used by logout / re-auth to act on the exact session and by audit to tie events to it.
   */
  authSessionId?: string;
}
