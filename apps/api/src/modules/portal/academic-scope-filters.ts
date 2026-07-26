import { and, eq, inArray, isNull, or, schema, type Database, type PgColumn, type SQL } from '@edrion/database';

export interface AcademicScopeFilterQuery {
  academicYearId?: string;
  termId?: string;
}

/**
 * Subquery filter: student id is enrolled in the requested year/term.
 * term_id NULL on the enrollment = whole year (matches every term of that year).
 * Use inArray — never join — so list counts stay correct.
 */
export function enrolledStudentsCond(
  db: Database,
  q: AcademicScopeFilterQuery,
  studentIdCol: PgColumn,
): SQL | undefined {
  if (!q.academicYearId && !q.termId) return undefined;
  const e = schema.studentEnrollments;
  const conds: SQL[] = [eq(e.status, 'active')];
  if (q.academicYearId) conds.push(eq(e.academicYearId, q.academicYearId));
  if (q.termId) {
    const termMatch = or(eq(e.termId, q.termId), isNull(e.termId));
    if (termMatch) conds.push(termMatch);
  }
  return inArray(studentIdCol, db.select({ id: e.studentId }).from(e).where(and(...conds)));
}

/**
 * Subquery filter: staff id has an assignment in the requested year/term.
 * term_id NULL = whole-year assignment.
 */
export function assignedStaffCond(
  db: Database,
  q: AcademicScopeFilterQuery,
  staffIdCol: PgColumn,
): SQL | undefined {
  if (!q.academicYearId && !q.termId) return undefined;
  const a = schema.staffAssignments;
  const conds: SQL[] = [eq(a.status, 'active')];
  if (q.academicYearId) conds.push(eq(a.academicYearId, q.academicYearId));
  if (q.termId) {
    const termMatch = or(eq(a.termId, q.termId), isNull(a.termId));
    if (termMatch) conds.push(termMatch);
  }
  return inArray(staffIdCol, db.select({ id: a.staffId }).from(a).where(and(...conds)));
}
