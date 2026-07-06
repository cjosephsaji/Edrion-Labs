import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { classes, subjects, academicTerms, academicYears } from './academics';
import { students, staff } from './people';
import { independentUsers } from './users';
import { storageObjects } from './student';

/** Plan 03 — school homework. */
export const homework = pgTable(
  'homework',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    teacherId: uuid('teacher_id').references(() => staff.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    instructions: text('instructions'),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    aiPolicy: text('ai_policy').notNull().default('off'),
    status: text('status').notNull().default('draft'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    classIdx: index('homework_class_idx').on(t.classId, t.dueAt),
    instIdx: index('homework_institution_idx').on(t.institutionId),
  }),
);

export const homeworkQuestions = pgTable(
  'homework_questions',
  {
    id: primaryId(),
    homeworkId: uuid('homework_id')
      .notNull()
      .references(() => homework.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    promptText: text('prompt_text'),
    promptImageObjectId: uuid('prompt_image_object_id').references(() => storageObjects.id, {
      onDelete: 'set null',
    }),
    maxMarks: integer('max_marks'),
  },
  (t) => ({
    uniq: uniqueIndex('homework_questions_homework_seq_uq').on(t.homeworkId, t.sequence),
  }),
);

export const homeworkAssignees = pgTable(
  'homework_assignees',
  {
    id: primaryId(),
    homeworkId: uuid('homework_id')
      .notNull()
      .references(() => homework.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    uniq: uniqueIndex('homework_assignees_uq').on(t.homeworkId, t.studentId),
  }),
);

export const homeworkSubmissions = pgTable(
  'homework_submissions',
  {
    id: primaryId(),
    homeworkId: uuid('homework_id')
      .notNull()
      .references(() => homework.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('assigned'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    returnedAt: timestamp('returned_at', { withTimezone: true }),
    totalMarks: integer('total_marks'),
    totalMax: integer('total_max'),
    teacherNote: text('teacher_note'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    uniq: uniqueIndex('homework_submissions_uq').on(t.homeworkId, t.studentId),
  }),
);

export const homeworkAnswers = pgTable(
  'homework_answers',
  {
    id: primaryId(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => homeworkSubmissions.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => homeworkQuestions.id, { onDelete: 'cascade' }),
    mode: text('mode').notNull().default('type'),
    answerText: text('answer_text'),
    answerObjectId: uuid('answer_object_id').references(() => storageObjects.id, { onDelete: 'set null' }),
    teacherMarks: integer('teacher_marks'),
    teacherFeedback: text('teacher_feedback'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex('homework_answers_uq').on(t.submissionId, t.questionId),
  }),
);

export const assignmentSubmissionVersions = pgTable(
  'assignment_submission_versions',
  {
    id: primaryId(),
    submissionId: uuid('submission_id').notNull(),
    versionNo: integer('version_no').notNull(),
    fileObjectIds: jsonb('file_object_ids').$type<string[]>().notNull().default([]),
    note: text('note'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    late: boolean('late').notNull().default(false),
  },
  (t) => ({
    uniq: uniqueIndex('assignment_submission_versions_uq').on(t.submissionId, t.versionNo),
  }),
);

export const classStreamPosts = pgTable(
  'class_stream_posts',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    contextType: text('context_type').notNull(),
    contextId: uuid('context_id').notNull(),
    kind: text('kind').notNull(),
    title: text('title'),
    body: text('body'),
    topicKey: text('topic_key'),
    postedBy: uuid('posted_by').references(() => staff.id, { onDelete: 'set null' }),
    requiresAck: boolean('requires_ack').notNull().default(false),
    postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    ctxIdx: index('stream_ctx_idx').on(t.contextType, t.contextId, t.postedAt),
  }),
);

export const classStreamAcks = pgTable(
  'class_stream_acks',
  {
    id: primaryId(),
    postId: uuid('post_id')
      .notNull()
      .references(() => classStreamPosts.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    ackedAt: timestamp('acked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex('class_stream_acks_uq').on(t.postId, t.studentId),
  }),
);

export const classMaterials = pgTable(
  'class_materials',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    contextType: text('context_type').notNull(),
    contextId: uuid('context_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    kindLabel: text('kind_label').notNull().default('PDF'),
    objectId: uuid('object_id')
      .notNull()
      .references(() => storageObjects.id, { onDelete: 'restrict' }),
    weekNo: integer('week_no'),
    postedBy: uuid('posted_by').references(() => staff.id, { onDelete: 'set null' }),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    ctxIdx: index('class_materials_ctx_idx').on(t.contextType, t.contextId),
  }),
);

export const courses = pgTable(
  'courses',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    credits: integer('credits'),
    professorTeacherId: uuid('professor_teacher_id').references(() => staff.id, { onDelete: 'set null' }),
    termId: uuid('term_id').references(() => academicTerms.id, { onDelete: 'set null' }),
    officeHours: text('office_hours'),
    gradingScheme: jsonb('grading_scheme').$type<{ component: string; weightPct: number }[]>().notNull().default([]),
    attendanceRequiredPct: integer('attendance_required_pct').notNull().default(75),
    status: text('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    codeTermUq: uniqueIndex('courses_inst_code_term_uq').on(t.institutionId, t.code, t.termId),
  }),
);

export const courseEnrollments = pgTable(
  'course_enrollments',
  {
    id: primaryId(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    uniq: uniqueIndex('course_enrollments_uq').on(t.courseId, t.studentId),
  }),
);

export const courseSyllabusModules = pgTable(
  'course_syllabus_modules',
  {
    id: primaryId(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    weekNo: integer('week_no').notNull(),
    title: text('title').notNull(),
    topics: jsonb('topics').$type<string[]>().notNull().default([]),
    covered: boolean('covered').notNull().default(false),
    coveredAt: timestamp('covered_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
  },
  (t) => ({
    uniq: uniqueIndex('course_syllabus_modules_uq').on(t.courseId, t.weekNo),
  }),
);

/** Student-portal calendar events (Plan 03). Distinct from parent-portal calendar_events. */
export const portalCalendarEvents = pgTable(
  'portal_calendar_events',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    detail: text('detail'),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on'),
    timeLabel: text('time_label'),
    audience: jsonb('audience').$type<Record<string, unknown>>().notNull().default({}),
    sourceRef: jsonb('source_ref').$type<Record<string, unknown>>(),
    status: text('status').notNull().default('published'),
    version: integer('version').notNull().default(1),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instDateIdx: index('portal_calendar_events_inst_date_idx').on(t.institutionId, t.startsOn),
  }),
);

export const studentPlannerItems = pgTable(
  'student_planner_items',
  {
    id: primaryId(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    title: text('title').notNull(),
    onDate: date('on_date').notNull(),
    timeLabel: text('time_label'),
    kind: text('kind').notNull().default('task'),
    topicKey: text('topic_key'),
    done: boolean('done').notNull().default(false),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    studentDateIdx: index('student_planner_items_student_date_idx').on(t.studentId, t.onDate),
  }),
);

export const studentExamGoals = pgTable(
  'student_exam_goals',
  {
    id: primaryId(),
    independentUserId: uuid('independent_user_id')
      .notNull()
      .references(() => independentUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    examDate: date('exam_date').notNull(),
    syllabusTopics: jsonb('syllabus_topics').$type<string[]>().notNull().default([]),
    status: text('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    userIdx: index('student_exam_goals_user_idx').on(t.independentUserId),
  }),
);

export const reportCards = pgTable(
  'report_cards',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id').references(() => academicYears.id, { onDelete: 'set null' }),
    termId: uuid('term_id').references(() => academicTerms.id, { onDelete: 'set null' }),
    termLabel: text('term_label').notNull(),
    kind: text('kind').notNull(),
    pdfObjectId: uuid('pdf_object_id').references(() => storageObjects.id, { onDelete: 'set null' }),
    gpa: numeric('gpa', { precision: 4, scale: 2 }),
    status: text('status').notNull().default('draft'),
    supersedesReportCardId: uuid('supersedes_report_card_id'),
    submittedForReviewBy: uuid('submitted_for_review_by'),
    reviewedBy: uuid('reviewed_by'),
    publishedBy: uuid('published_by'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    studentIdx: index('report_cards_student_idx').on(t.studentId, t.publishedAt),
  }),
);

export const reportCardEntries = pgTable(
  'report_card_entries',
  {
    id: primaryId(),
    reportCardId: uuid('report_card_id')
      .notNull()
      .references(() => reportCards.id, { onDelete: 'cascade' }),
    subjectLabel: text('subject_label').notNull(),
    component: text('component'),
    marks: integer('marks').notNull(),
    maxMarks: integer('max_marks').notNull(),
    gradeLetter: text('grade_letter'),
    remarks: text('remarks'),
    credits: integer('credits'),
    sequence: integer('sequence').notNull().default(0),
  },
  (t) => ({
    cardIdx: index('report_card_entries_card_idx').on(t.reportCardId),
  }),
);

export type Homework = typeof homework.$inferSelect;
export type HomeworkQuestion = typeof homeworkQuestions.$inferSelect;
export type HomeworkSubmission = typeof homeworkSubmissions.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type ReportCard = typeof reportCards.$inferSelect;
export type PortalCalendarEvent = typeof portalCalendarEvents.$inferSelect;
export type StudentPlannerItem = typeof studentPlannerItems.$inferSelect;
export type StudentExamGoal = typeof studentExamGoals.$inferSelect;
