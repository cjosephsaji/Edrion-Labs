import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { classes, subjects, academicYears, academicTerms } from './academics';
import { students, staff } from './people';
import { storageObjects } from './student';

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
    /** Direct year/term stamp — a year-long class has term_id NULL, so Sem-2 work needs its own. */
    academicYearId: uuid('academic_year_id').references(() => academicYears.id, { onDelete: 'set null' }),
    termId: uuid('term_id').references(() => academicTerms.id, { onDelete: 'set null' }),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    teacherId: uuid('teacher_id').references(() => staff.id, { onDelete: 'set null' }),
    instructions: text('instructions'),
    dueDate: date('due_date'),
    maxPoints: integer('max_points').notNull().default(100),
    /** draft | published | closed. */
    status: text('status').notNull().default('draft'),
    attachmentObjectIds: jsonb('attachment_object_ids').$type<string[]>().notNull().default([]),
    latePolicy: jsonb('late_policy').$type<{ penaltyPercentPerDay: number; maxLateDays: number } | null>(),
    allowResubmission: boolean('allow_resubmission').notNull().default(false),
    aiPolicy: text('ai_policy').notNull().default('off'),
    courseId: uuid('course_id'),
    /** Raw recipient targets for re-rendering the picker on edit. */
    audience: jsonb('audience').$type<Array<{ kind: string; refId?: string | null }>>().notNull().default([]),
    /** Online attempt duration in minutes (null = no timed attempt). */
    durationMin: integer('duration_min'),
    /** file = file-submission flow; quiz = question/attempt flow. */
    deliveryMode: text('delivery_mode').notNull().default('file'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('assignments_institution_idx').on(t.institutionId),
    scopeIdx: index('assignments_institution_campus_idx').on(t.institutionId, t.campusId),
    classIdx: index('assignments_class_idx').on(t.classId),
    statusIdx: index('assignments_status_idx').on(t.status),
    yearIdx: index('assignments_year_idx').on(t.academicYearId),
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

/** A question within a quiz-mode assignment. */
export const assignmentQuestions = pgTable(
  'assignment_questions',
  {
    id: primaryId(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => assignments.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    qtype: text('qtype').notNull(),
    prompt: text('prompt').notNull(),
    promptImageObjectId: uuid('prompt_image_object_id').references(() => storageObjects.id, { onDelete: 'set null' }),
    options: jsonb('options').$type<Array<{ key: string; label: string; imageObjectId?: string }>>(),
    correctKey: text('correct_key'),
    markingNote: text('marking_note'),
    marks: integer('marks').notNull().default(1),
    /** Type-specific authoring config (matching pairs, code tests, file constraints, …). */
    config: jsonb('config').$type<Record<string, unknown>>(),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    assignmentIdx: index('assignment_questions_assignment_idx').on(t.assignmentId),
    uniq: uniqueIndex('assignment_questions_assignment_sequence_uq').on(t.assignmentId, t.sequence),
  }),
);

/** Materialized student roster for an assignment (from resolved audience targets). */
export const assignmentAssignees = pgTable(
  'assignment_assignees',
  {
    id: primaryId(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => assignments.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    uniq: uniqueIndex('assignment_assignees_assignment_student_uq').on(t.assignmentId, t.studentId),
  }),
);

/** Per-student attempt on a quiz-mode assignment. */
export const assignmentAttempts = pgTable(
  'assignment_attempts',
  {
    id: primaryId(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => assignments.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    attemptNo: integer('attempt_no').notNull().default(1),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    autoScore: integer('auto_score'),
    maxScore: integer('max_score'),
    status: text('status').notNull().default('in_progress'),
    results: jsonb('results'),
  },
  (t) => ({
    assignmentIdx: index('assignment_attempts_assignment_idx').on(t.assignmentId),
    studentIdx: index('assignment_attempts_student_idx').on(t.studentId),
    uniq: uniqueIndex('assignment_attempts_assignment_student_attempt_uq').on(t.assignmentId, t.studentId, t.attemptNo),
  }),
);

/** Per-question answer within an assignment attempt. */
export const assignmentAnswers = pgTable(
  'assignment_answers',
  {
    id: primaryId(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => assignmentAttempts.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => assignmentQuestions.id, { onDelete: 'cascade' }),
    choiceKey: text('choice_key'),
    answerText: text('answer_text'),
    answerObjectId: uuid('answer_object_id').references(() => storageObjects.id, { onDelete: 'set null' }),
    /** Structured answer payload (matching map, code source, multi-file ids, …). */
    answerJson: jsonb('answer_json').$type<Record<string, unknown>>(),
    autoCorrect: boolean('auto_correct'),
    awardedMarks: integer('awarded_marks'),
    teacherMarks: integer('teacher_marks'),
    teacherFeedback: text('teacher_feedback'),
    aiNote: text('ai_note'),
    needsReview: boolean('needs_review').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex('assignment_answers_attempt_question_uq').on(t.attemptId, t.questionId),
  }),
);

export type AssignmentQuestion = typeof assignmentQuestions.$inferSelect;
export type NewAssignmentQuestion = typeof assignmentQuestions.$inferInsert;
export type AssignmentAssignee = typeof assignmentAssignees.$inferSelect;
export type AssignmentAttempt = typeof assignmentAttempts.$inferSelect;
export type AssignmentAnswer = typeof assignmentAnswers.$inferSelect;
