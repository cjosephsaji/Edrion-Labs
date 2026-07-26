import { eq, type SQL } from '@edrion/database';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { StudentPrincipal } from '../student.types';

export interface OwnerColumns {
  institutionId: string | null;
  studentId: string | null;
  independentUserId: string | null;
}

export function ownerColumns(principal: StudentPrincipal): OwnerColumns {
  if (principal.kind === 'institutional') {
    return {
      institutionId: principal.institutionId,
      studentId: principal.studentId,
      independentUserId: null,
    };
  }
  return {
    institutionId: null,
    studentId: null,
    independentUserId: principal.independentUserId,
  };
}

export function ownerWhere(
  principal: StudentPrincipal,
  studentCol: PgColumn,
  indepCol: PgColumn,
): SQL {
  const o = ownerColumns(principal);
  if (o.studentId) return eq(studentCol, o.studentId);
  return eq(indepCol, o.independentUserId!);
}

export function displayName(principal: StudentPrincipal): string {
  return principal.fullName;
}
