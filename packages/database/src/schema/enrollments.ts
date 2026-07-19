import { date, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import {
  academicYears,
  academicTerms,
  classes,
  departmentGradeLevels,
  departments,
  gradeLevels,
} from './academics';
import { students, staff } from './people';

/**
 * Per-year (and optionally per-term) placement history for students and staff.
 *
 * Grain: (person, academic_year_id, term_id) where term_id NULL = whole year.
 * Mirrors classes.term_id. K-12 writes one row per year; universities one per semester.
 *
 * Real `.references()` are safe here — academics already imports people; nothing imports this file
 * back into that cycle.
 */

/** A student's placement in a given academic year / term. */
export const studentEnrollments = pgTable(
  'student_enrollments',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'restrict' }),
    /** NULL = whole-year enrollment (K-12). */
    termId: uuid('term_id').references(() => academicTerms.id, { onDelete: 'set null' }),
    programmeLevelId: uuid('programme_level_id').references(() => departmentGradeLevels.id, {
      onDelete: 'set null',
    }),
    gradeLevelId: uuid('grade_level_id').references(() => gradeLevels.id, { onDelete: 'set null' }),
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
    rollNo: text('roll_no'),
    /** active | completed | withdrawn | transferred | promoted. */
    status: text('status').notNull().default('active'),
    enrolledOn: date('enrolled_on'),
    exitedOn: date('exited_on'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('student_enrollments_institution_idx').on(t.institutionId),
    scopeIdx: index('student_enrollments_institution_campus_idx').on(t.institutionId, t.campusId),
    /** Hot path for year/term directory filters. */
    yearTermStudentIdx: index('student_enrollments_year_term_student_idx').on(
      t.institutionId,
      t.academicYearId,
      t.termId,
      t.studentId,
    ),
    studentIdx: index('student_enrollments_student_idx').on(t.studentId),
    classIdx: index('student_enrollments_class_idx').on(t.classId),
    /** One whole-year row per student per year. */
    yearWholeUniq: uniqueIndex('student_enrollments_year_whole_uniq')
      .on(t.studentId, t.academicYearId)
      .where(sql`term_id IS NULL`),
    /** One per-term row per student per year+term. */
    yearTermUniq: uniqueIndex('student_enrollments_year_term_uniq')
      .on(t.studentId, t.academicYearId, t.termId)
      .where(sql`term_id IS NOT NULL`),
  }),
);

/** A staff member's assignment in a given academic year / term. */
export const staffAssignments = pgTable(
  'staff_assignments',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staff.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'restrict' }),
    /** NULL = whole-year assignment. */
    termId: uuid('term_id').references(() => academicTerms.id, { onDelete: 'set null' }),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    designation: text('designation'),
    /** full_time | part_time | contract | visiting. */
    employmentType: text('employment_type'),
    /** active | inactive | ended. */
    status: text('status').notNull().default('active'),
    startedOn: date('started_on'),
    endedOn: date('ended_on'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('staff_assignments_institution_idx').on(t.institutionId),
    scopeIdx: index('staff_assignments_institution_campus_idx').on(t.institutionId, t.campusId),
    yearTermStaffIdx: index('staff_assignments_year_term_staff_idx').on(
      t.institutionId,
      t.academicYearId,
      t.termId,
      t.staffId,
    ),
    staffIdx: index('staff_assignments_staff_idx').on(t.staffId),
    yearWholeUniq: uniqueIndex('staff_assignments_year_whole_uniq')
      .on(t.staffId, t.academicYearId)
      .where(sql`term_id IS NULL`),
    yearTermUniq: uniqueIndex('staff_assignments_year_term_uniq')
      .on(t.staffId, t.academicYearId, t.termId)
      .where(sql`term_id IS NOT NULL`),
  }),
);

export type StudentEnrollment = typeof studentEnrollments.$inferSelect;
export type NewStudentEnrollment = typeof studentEnrollments.$inferInsert;
export type StaffAssignment = typeof staffAssignments.$inferSelect;
export type NewStaffAssignment = typeof staffAssignments.$inferInsert;
