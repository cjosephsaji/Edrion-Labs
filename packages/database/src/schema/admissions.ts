import { date, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { gradeLevels } from './academics';
import { students } from './people';

/**
 * INSTITUTION-PORTAL admissions (Phase 5): prospective-student applications and their decision
 * lifecycle. Same tenant convention as academics/people:
 *   id, institution_id (ALWAYS), campus_id (nullable — null = institution-owned/shared),
 *   …domain columns…, actorColumns, timestamps, version
 * with indexes on (institution_id) and (institution_id, campus_id). Reads/writes are confined to
 * one institution + the request's active campus scope at the service layer (and later RLS).
 *
 * Unlike people, an applicant is NOT yet a student. `grade_level_id` is the grade applied for; on
 * acceptance the portal can enrol the applicant — creating a `students` row and stamping
 * `enrolled_student_id` here, the admissions→students bridge (mirrors how academics points at
 * teachers). Both FKs reference forward-only tables (academics/people never reference admissions),
 * so there is no Drizzle type cycle and plain `.references()` is safe.
 */
export const admissionApplications = pgTable(
  'admission_applications',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    /** Application reference (unique within the institution). */
    applicationNo: text('application_no').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    /** male | female | other (free-text; validated in zod). */
    gender: text('gender'),
    dateOfBirth: date('date_of_birth'),
    email: text('email'),
    phone: text('phone'),
    /** The grade the applicant is applying for. */
    gradeLevelId: uuid('grade_level_id').references(() => gradeLevels.id, { onDelete: 'set null' }),
    previousSchool: text('previous_school'),
    guardianName: text('guardian_name'),
    guardianPhone: text('guardian_phone'),
    guardianEmail: text('guardian_email'),
    /** submitted | under_review | accepted | rejected | waitlisted | enrolled | withdrawn. */
    status: text('status').notNull().default('submitted'),
    appliedDate: date('applied_date'),
    decisionDate: date('decision_date'),
    decisionNote: text('decision_note'),
    /** Set once the applicant is enrolled — the student created from this application. */
    enrolledStudentId: uuid('enrolled_student_id').references(() => students.id, {
      onDelete: 'set null',
    }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('admission_applications_institution_idx').on(t.institutionId),
    scopeIdx: index('admission_applications_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('admission_applications_status_idx').on(t.status),
    applicationUniq: uniqueIndex('admission_application_no_uniq').on(t.institutionId, t.applicationNo),
  }),
);

export type AdmissionApplication = typeof admissionApplications.$inferSelect;
export type NewAdmissionApplication = typeof admissionApplications.$inferInsert;
