import { and, eq, schema, type Database } from '@edrion/database';
import type { CampusFilter } from './portal-scope';
import { scopeConds } from './portal-scope';

export interface AcademicScopeStamp {
  academicYearId: string | null;
  termId: string | null;
}

export interface ResolveAcademicScopeInput {
  institutionId: string;
  campusIds: CampusFilter;
  classId?: string | null;
  examId?: string | null;
  feeStructureId?: string | null;
}

/**
 * Derive academic_year_id / term_id for a new transactional row.
 * Preference: class → exam → fee structure → institution current year.
 * term_id NULL means whole-year (same convention as classes.term_id).
 */
export async function resolveAcademicScope(
  db: Database,
  input: ResolveAcademicScopeInput,
): Promise<AcademicScopeStamp> {
  let academicYearId: string | null = null;
  let termId: string | null = null;

  if (input.classId) {
    const [cls] = await db
      .select({
        academicYearId: schema.classes.academicYearId,
        termId: schema.classes.termId,
      })
      .from(schema.classes)
      .where(
        and(eq(schema.classes.id, input.classId), eq(schema.classes.institutionId, input.institutionId)),
      )
      .limit(1);
    if (cls) {
      academicYearId = cls.academicYearId;
      termId = cls.termId;
    }
  }

  if (!academicYearId && input.examId) {
    const [exam] = await db
      .select({
        academicYearId: schema.exams.academicYearId,
        termId: schema.exams.termId,
      })
      .from(schema.exams)
      .where(and(eq(schema.exams.id, input.examId), eq(schema.exams.institutionId, input.institutionId)))
      .limit(1);
    if (exam) {
      academicYearId = exam.academicYearId;
      termId = exam.termId;
    }
  }

  if (!academicYearId && input.feeStructureId) {
    const [fs] = await db
      .select({
        academicYearId: schema.feeStructures.academicYearId,
        termId: schema.feeStructures.termId,
      })
      .from(schema.feeStructures)
      .where(
        and(
          eq(schema.feeStructures.id, input.feeStructureId),
          eq(schema.feeStructures.institutionId, input.institutionId),
        ),
      )
      .limit(1);
    if (fs) {
      academicYearId = fs.academicYearId ?? null;
      termId = fs.termId ?? null;
    }
  }

  if (!academicYearId) {
    academicYearId = await findCurrentYearId(db, input.institutionId, input.campusIds);
  }

  return { academicYearId, termId };
}

/** Load a class row's year/term placement fields (for enrollment writes). */
export async function loadClassScope(
  db: Database,
  classId: string,
  institutionId: string,
): Promise<{
  academicYearId: string;
  termId: string | null;
  programmeLevelId: string | null;
  gradeLevelId: string;
  campusId: string | null;
} | null> {
  const [cls] = await db
    .select({
      academicYearId: schema.classes.academicYearId,
      termId: schema.classes.termId,
      programmeLevelId: schema.classes.programmeLevelId,
      gradeLevelId: schema.classes.gradeLevelId,
      campusId: schema.classes.campusId,
    })
    .from(schema.classes)
    .where(and(eq(schema.classes.id, classId), eq(schema.classes.institutionId, institutionId)))
    .limit(1);
  return cls ?? null;
}

/** Current academic year id for an institution/campus scope, or null. */
export async function findCurrentYearId(
  db: Database,
  institutionId: string,
  campusIds: CampusFilter,
): Promise<string | null> {
  const t = schema.academicYears;
  const conds = [...scopeConds(t.institutionId, t.campusId, institutionId, campusIds), eq(t.isCurrent, true)];
  const [row] = await db.select({ id: t.id }).from(t).where(and(...conds)).limit(1);
  return row?.id ?? null;
}

/** Close active enrollments for a student (status transferred). */
export async function closeActiveStudentEnrollments(
  db: Database,
  studentId: string,
  exitedOn: string,
): Promise<void> {
  await db
    .update(schema.studentEnrollments)
    .set({ status: 'transferred', exitedOn, updatedAt: new Date() })
    .where(
      and(eq(schema.studentEnrollments.studentId, studentId), eq(schema.studentEnrollments.status, 'active')),
    );
}

export async function insertStudentEnrollment(
  db: Database,
  values: typeof schema.studentEnrollments.$inferInsert,
): Promise<void> {
  await db.insert(schema.studentEnrollments).values(values).onConflictDoNothing();
}

export async function insertStaffAssignment(
  db: Database,
  values: typeof schema.staffAssignments.$inferInsert,
): Promise<void> {
  await db.insert(schema.staffAssignments).values(values).onConflictDoNothing();
}
