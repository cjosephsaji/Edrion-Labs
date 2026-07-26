import { boolean, date, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { institutionUsers } from './users';

/**
 * NOTE on the people→academics foreign keys (grade_level_id, class_id, department_id): these are
 * plain uuid columns here, not Drizzle `.references()`, to break the academics↔people type cycle
 * (academics already references `staff` for class/subject teaching + headship). The matching DB
 * FK constraints are still created — by hand in migration 0014 — and the service layer pre-checks
 * each reference for a friendly 400 (see PeopleService.assertRef), exactly like academics does.
 */

/**
 * INSTITUTION-PORTAL people directory (Phase 4): students, staff (teaching + non-teaching),
 * parents/guardians, and the student↔guardian join. Same tenant convention as the academic
 * structure (academics.ts):
 *   id, institution_id (ALWAYS), campus_id (nullable — null = institution-owned/shared),
 *   …domain columns…, actorColumns, timestamps, version
 * with indexes on (institution_id) and (institution_id, campus_id). Reads/writes are confined to
 * one institution + the request's active campus scope at the service layer (and later RLS).
 *
 * Staff are the FK targets the academic structure points at: a class teacher, a department head
 * and a class-subject teacher are all `staff` rows. Teaching capability is role-derived
 * (academics.teach). A staff/parent MAY also be linked to an
 * `institution_users` portal login via `institution_user_id`, but that link is optional — most
 * people in the directory never sign in.
 */

/** A person taught by the institution. Always campus-scoped in practice (stamped on create). */
export const students = pgTable(
  'students',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    /** Institution admission/enrolment number (unique within the institution). */
    admissionNo: text('admission_no').notNull(),
    firstName: text('first_name').notNull(),
    middleName: text('middle_name'),
    lastName: text('last_name').notNull(),
    /** male | female | other (free-text; validated in zod). */
    gender: text('gender'),
    dateOfBirth: date('date_of_birth'),
    email: text('email'),
    phone: text('phone'),
    /** Optional placement into the academic structure (FK added in migration; see header note). */
    gradeLevelId: uuid('grade_level_id'),
    classId: uuid('class_id'),
    rollNo: text('roll_no'),
    /** Optional link to a portal login (student role). Mirrors staff.institution_user_id. */
    institutionUserId: uuid('institution_user_id'),
    address: text('address'),
    /** enrolled | inactive | graduated | transferred | alumni. */
    status: text('status').notNull().default('enrolled'),
    enrollmentDate: date('enrollment_date'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('students_institution_idx').on(t.institutionId),
    scopeIdx: index('students_institution_campus_idx').on(t.institutionId, t.campusId),
    classIdx: index('students_class_idx').on(t.classId),
    admissionUniq: uniqueIndex('students_admission_uniq').on(t.institutionId, t.admissionNo),
  }),
);

/** A staff member (teaching or non-teaching). FK target for class/subject teaching + department headship. */
export const staff = pgTable(
  'staff',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    employeeNo: text('employee_no'),
    firstName: text('first_name').notNull(),
    middleName: text('middle_name'),
    lastName: text('last_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    /** Optional department (FK added in migration; see header note). */
    departmentId: uuid('department_id'),
    /** e.g. "Accountant", "Front Office". */
    designation: text('designation'),
    /** full_time | part_time | contract | visiting. */
    employmentType: text('employment_type').notNull().default('full_time'),
    /** active | inactive | on_leave. */
    status: text('status').notNull().default('active'),
    joinDate: date('join_date'),
    institutionUserId: uuid('institution_user_id').references(() => institutionUsers.id, {
      onDelete: 'set null',
    }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('staff_institution_idx').on(t.institutionId),
    scopeIdx: index('staff_institution_campus_idx').on(t.institutionId, t.campusId),
    deptIdx: index('staff_department_idx').on(t.departmentId),
    institutionUserIdx: index('staff_institution_user_idx').on(t.institutionUserId),
    employeeUniq: uniqueIndex('staff_employee_uniq').on(t.institutionId, t.employeeNo),
  }),
);

/** A parent / guardian. Linked to students via student_guardians (many-to-many). */
export const parents = pgTable(
  'parents',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    firstName: text('first_name').notNull(),
    middleName: text('middle_name'),
    lastName: text('last_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    occupation: text('occupation'),
    address: text('address'),
    institutionUserId: uuid('institution_user_id').references(() => institutionUsers.id, {
      onDelete: 'set null',
    }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('parents_institution_idx').on(t.institutionId),
    scopeIdx: index('parents_institution_campus_idx').on(t.institutionId, t.campusId),
  }),
);

/** Which parent is a guardian of which student, and how. The student↔guardian join. */
export const studentGuardians = pgTable(
  'student_guardians',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id')
      .notNull()
      .references(() => parents.id, { onDelete: 'cascade' }),
    /** father | mother | guardian | other. */
    relationship: text('relationship').notNull().default('guardian'),
    /** The primary guardian for the student (typically exactly one). */
    isPrimary: boolean('is_primary').notNull().default(false),
    isEmergencyContact: boolean('is_emergency_contact').notNull().default(false),
    /**
     * Parent-portal per-guardian visibility restrictions (e.g. a court order blocking fees/health).
     * Shape: { fees?: boolean; health?: boolean; behavior?: boolean; ... } — true = HIDE that section.
     * Honored by GuardianScopeGuard when building the guardian context.
     */
    visibilityOverrides: jsonb('visibility_overrides')
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('student_guardians_institution_idx').on(t.institutionId),
    studentIdx: index('student_guardians_student_idx').on(t.studentId),
    parentIdx: index('student_guardians_parent_idx').on(t.parentId),
    uniq: uniqueIndex('student_guardian_uniq').on(t.studentId, t.parentId),
  }),
);

export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;
export type Parent = typeof parents.$inferSelect;
export type NewParent = typeof parents.$inferInsert;
export type StudentGuardian = typeof studentGuardians.$inferSelect;
export type NewStudentGuardian = typeof studentGuardians.$inferInsert;
