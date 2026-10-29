import type { EvaluatedPermissions } from '@edrion/permissions';

/** Institutional student principal — linked institution_user + students row. */
export interface InstitutionalStudentPrincipal {
  kind: 'institutional';
  institutionId: string;
  campusId: string | null;
  institutionUserId: string;
  studentId: string;
  email: string;
  fullName: string;
  lastAuthAt: Date | null;
  passwordChangeRequired?: boolean;
  permissions: string[];
}

/** Independent learner principal. */
export interface IndependentStudentPrincipal {
  kind: 'independent';
  independentUserId: string;
  email: string;
  fullName: string;
  lastAuthAt: Date | null;
  permissions: string[];
}

export type StudentPrincipal = InstitutionalStudentPrincipal | IndependentStudentPrincipal;

export interface StudentContext {
  principal: StudentPrincipal;
  authSessionId?: string;
}

export type StudentSessionKind = StudentPrincipal['kind'];

export interface StudentSessionTokenPayload {
  sid: string;
  uid: string;
  kind: StudentSessionKind;
  passwordSetupOnly?: boolean;
  iat?: number;
  exp?: number;
}

/** Expand evaluated permissions to a concrete string[] for API responses. */
export function permissionsList(evaluated: EvaluatedPermissions): string[] {
  return [...evaluated.keys].filter((k) => k !== '*');
}

declare module 'express' {
  interface Request {
    studentContext?: StudentContext;
  }
}
