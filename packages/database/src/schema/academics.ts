import { boolean, date, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { staff } from './people';

/**
 * INSTITUTION-PORTAL academic structure (Phase 2). Every table follows the tenant convention:
 *   id, institution_id (ALWAYS), campus_id (nullable — null = institution-owned/shared across
 *   campuses), …domain columns…, actorColumns, timestamps, version
 * with indexes on (institution_id) and (institution_id, campus_id). Reads/writes are confined to
 * one institution + the request's active campus scope at the service layer (and later RLS).
 *
 * campus_id semantics: a NULL campus_id means the row applies to the whole institution and is
 * visible in every scope; a set campus_id means the row belongs to that campus only.
 */

/** A school year (e.g. "2025–2026"). Usually institution-wide; may be campus-specific. */
export const academicYears = pgTable(
  'academic_years',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    /** Exactly one year is typically "current" per scope; the service enforces single-current. */
    isCurrent: boolean('is_current').notNull().default(false),
    /** planning | active | archived. */
    status: text('status').notNull().default('planning'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('academic_years_institution_idx').on(t.institutionId),
    scopeIdx: index('academic_years_institution_campus_idx').on(t.institutionId, t.campusId),
  }),
);

/** An academic/administrative department (e.g. "Science", "Mathematics"). */
export const departments = pgTable(
  'departments',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code').notNull(),
    /** Optional department head — a teacher (People phase, teachers.ts is the FK target). */
    headUserId: uuid('head_user_id').references(() => staff.id, { onDelete: 'set null' }),
    description: text('description'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('departments_institution_idx').on(t.institutionId),
    scopeIdx: index('departments_institution_campus_idx').on(t.institutionId, t.campusId),
  }),
);

/** A grade / year-level (e.g. "Grade 1"). `level` orders them numerically. */
export const gradeLevels = pgTable(
  'grade_levels',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Sort order / numeric level (1 = first grade). */
    level: integer('level').notNull().default(0),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('grade_levels_institution_idx').on(t.institutionId),
    scopeIdx: index('grade_levels_institution_campus_idx').on(t.institutionId, t.campusId),
  }),
);

/** Links a Programme (department) to applicable Year/Level labels (grade_levels). */
export const departmentGradeLevels = pgTable(
  'department_grade_levels',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'cascade' }),
    gradeLevelId: uuid('grade_level_id')
      .notNull()
      .references(() => gradeLevels.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull().default(0),
    durationLabel: text('duration_label'),
    status: text('status').notNull().default('active'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('department_grade_levels_institution_idx').on(t.institutionId),
    scopeIdx: index('department_grade_levels_institution_campus_idx').on(t.institutionId, t.campusId),
    deptIdx: index('department_grade_levels_department_idx').on(t.departmentId),
    gradeIdx: index('department_grade_levels_grade_idx').on(t.gradeLevelId),
    uniq: uniqueIndex('department_grade_levels_dept_grade_uniq').on(t.departmentId, t.gradeLevelId),
  }),
);

/** A teachable subject (e.g. "Algebra"). `kind` = core | elective. */
export const subjects = pgTable(
  'subjects',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code').notNull(),
    /** core | elective. */
    kind: text('kind').notNull().default('core'),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('subjects_institution_idx').on(t.institutionId),
    scopeIdx: index('subjects_institution_campus_idx').on(t.institutionId, t.campusId),
  }),
);

/** A class / section (e.g. "Grade 1 – A") within a year + grade. Always campus-scoped. */
export const classes = pgTable(
  'classes',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'restrict' }),
    gradeLevelId: uuid('grade_level_id')
      .notNull()
      .references(() => gradeLevels.id, { onDelete: 'restrict' }),
    programmeLevelId: uuid('programme_level_id').references(() => departmentGradeLevels.id, {
      onDelete: 'set null',
    }),
    termId: uuid('term_id').references(() => academicTerms.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    /** Section label, e.g. "A". */
    section: text('section'),
    /** Class/home-room teacher — a teacher (People phase). */
    classTeacherId: uuid('class_teacher_id').references(() => staff.id, {
      onDelete: 'set null',
    }),
    room: text('room'),
    capacity: integer('capacity'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('classes_institution_idx').on(t.institutionId),
    scopeIdx: index('classes_institution_campus_idx').on(t.institutionId, t.campusId),
    yearIdx: index('classes_year_idx').on(t.academicYearId),
    gradeIdx: index('classes_grade_idx').on(t.gradeLevelId),
    programmeLevelIdx: index('classes_programme_level_idx').on(t.programmeLevelId),
    termIdx: index('classes_term_idx').on(t.termId),
  }),
);

/** Which subject is taught in which class, by which teacher. The class↔subject↔teacher join. */
export const classSubjectTeachers = pgTable(
  'class_subject_teachers',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    /** Assigned teacher — a teacher (People phase). Nullable until staffed. */
    teacherId: uuid('teacher_id').references(() => staff.id, { onDelete: 'set null' }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('class_subject_teachers_institution_idx').on(t.institutionId),
    classIdx: index('class_subject_teachers_class_idx').on(t.classId),
    uniq: uniqueIndex('class_subject_uniq').on(t.classId, t.subjectId),
  }),
);

/** A term/semester period within an academic year (e.g. "Semester 1"). */
export const academicTerms = pgTable(
  'academic_terms',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'restrict' }),
    programmeLevelId: uuid('programme_level_id').references(() => departmentGradeLevels.id, {
      onDelete: 'set null',
    }),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    gradeLevelId: uuid('grade_level_id').references(() => gradeLevels.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    /** term | semester | trimester | quarter. */
    kind: text('kind').notNull().default('term'),
    /** Order within the academic year (1 = first). */
    sequence: integer('sequence').notNull().default(1),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    isCurrent: boolean('is_current').notNull().default(false),
    /** planning | active | archived. */
    status: text('status').notNull().default('planning'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('academic_terms_institution_idx').on(t.institutionId),
    scopeIdx: index('academic_terms_institution_campus_idx').on(t.institutionId, t.campusId),
    yearIdx: index('academic_terms_year_idx').on(t.academicYearId),
    programmeLevelIdx: index('academic_terms_programme_level_idx').on(t.programmeLevelId),
  }),
);

export type AcademicYear = typeof academicYears.$inferSelect;
export type NewAcademicYear = typeof academicYears.$inferInsert;
export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
export type GradeLevel = typeof gradeLevels.$inferSelect;
export type NewGradeLevel = typeof gradeLevels.$inferInsert;
export type DepartmentGradeLevel = typeof departmentGradeLevels.$inferSelect;
export type NewDepartmentGradeLevel = typeof departmentGradeLevels.$inferInsert;
export type Subject = typeof subjects.$inferSelect;
export type NewSubject = typeof subjects.$inferInsert;
export type Class = typeof classes.$inferSelect;
export type NewClass = typeof classes.$inferInsert;
export type ClassSubjectTeacher = typeof classSubjectTeachers.$inferSelect;
export type NewClassSubjectTeacher = typeof classSubjectTeachers.$inferInsert;
export type AcademicTerm = typeof academicTerms.$inferSelect;
export type NewAcademicTerm = typeof academicTerms.$inferInsert;
