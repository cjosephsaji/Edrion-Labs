import { date, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { classes, subjects } from './academics';
import { students, teachers } from './people';

/**
 * INSTITUTION-PORTAL assignments (Phase 6). A two-level model, mirroring attendance/exams:
 *   - assignments: ONE piece of work set for a class, campus-scoped + version-guarded. Owns the
 *     title, subject/teacher, due date, max points and lifecycle status.
 *   - assignment_submissions: the per-student submission WITHIN an assignment — status, submitted
 *     date, points awarded, feedback. No campus column of its own: it inherits the assignment's
 *     campus and is only reachable through an assignment the caller can see. Upserted on
 *     (assignment, student) by the bulk-grade action.
 *
 * Same tenant convention; classes/subjects/teachers/students are forward-only, so plain
 * `.references()` is safe. Points are whole numbers (`integer`), consistent with the portal.
 */
export const assignments = pgTable(
  'assignments',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    teacherId: uuid('teacher_id').references(() => teachers.id, { onDelete: 'set null' }),
    instructions: text('instructions'),
    dueDate: date('due_date'),
    maxPoints: integer('max_points').notNull().default(100),
    /** draft | published | closed. */
    status: text('status').notNull().default('draft'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('assignments_institution_idx').on(t.institutionId),
    scopeIdx: index('assignments_institution_campus_idx').on(t.institutionId, t.campusId),
    classIdx: index('assignments_class_idx').on(t.classId),
    statusIdx: index('assignments_status_idx').on(t.status),
  }),
);

/** Per-student submission within an assignment. Upserted on (assignment, student). */
export const assignmentSubmissions = pgTable(
  'assignment_submissions',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => assignments.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    /** assigned | submitted | late | graded | missing. */
    status: text('status').notNull().default('assigned'),
    submittedDate: date('submitted_date'),
    pointsAwarded: integer('points_awarded'),
    feedback: text('feedback'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('assignment_submissions_institution_idx').on(t.institutionId),
    assignmentIdx: index('assignment_submissions_assignment_idx').on(t.assignmentId),
    studentIdx: index('assignment_submissions_student_idx').on(t.studentId),
    uniq: uniqueIndex('assignment_submission_uniq').on(t.assignmentId, t.studentId),
  }),
);

export type Assignment = typeof assignments.$inferSelect;
export type NewAssignment = typeof assignments.$inferInsert;
export type AssignmentSubmission = typeof assignmentSubmissions.$inferSelect;
export type NewAssignmentSubmission = typeof assignmentSubmissions.$inferInsert;
