import { boolean, date, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { academicYears, classes, subjects, academicTerms } from './academics';

/**
 * INSTITUTION-PORTAL exams (Phase 6). A two-level model, mirroring attendance:
 *   - exams: ONE exam event (e.g. "Term 1 Finals"), campus-scoped + version-guarded. Owns the
 *     type, term, dates and lifecycle status.
 *   - exam_schedules: the per-(class, subject) papers WITHIN an exam — date, time window, max/pass
 *     marks, room. No campus column of its own: it inherits the exam's campus and is only reachable
 *     through an exam the caller can see (the service confines reads/writes through the parent).
 *
 * Same tenant convention as the rest of the portal. classes/subjects/academic-years are
 * forward-only from exams (academics never references exams), so plain `.references()` is safe —
 * no Drizzle type cycle. One paper per (exam, class, subject).
 */
export const exams = pgTable(
  'exams',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** term | midterm | final | unit_test | quiz | practical | mock (free-text; validated in zod). */
    examType: text('exam_type').notNull().default('term'),
    /** Optional academic year this exam belongs to. */
    academicYearId: uuid('academic_year_id').references(() => academicYears.id, {
      onDelete: 'set null',
    }),
    /** Free-text term label, e.g. "Term 1" or "Semester 2". */
    termLabel: text('term_label'),
    /** Optional link to a structured academic term period. */
    termId: uuid('term_id').references(() => academicTerms.id, { onDelete: 'set null' }),
    startDate: date('start_date'),
    endDate: date('end_date'),
    /** draft | scheduled | ongoing | completed | published | cancelled. */
    status: text('status').notNull().default('draft'),
    description: text('description'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('exams_institution_idx').on(t.institutionId),
    scopeIdx: index('exams_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('exams_status_idx').on(t.status),
  }),
);

/** A scheduled paper within an exam — one per (exam, class, subject). */
export const examSchedules = pgTable(
  'exam_schedules',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exams.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    examDate: date('exam_date'),
    /** "HH:MM" 24-hour. */
    startTime: text('start_time'),
    endTime: text('end_time'),
    maxMarks: integer('max_marks').notNull().default(100),
    passMarks: integer('pass_marks'),
    room: text('room'),
    /** Parent-portal datesheet fields (§4.7): syllabus note, hall, seat info. */
    syllabusNote: text('syllabus_note'),
    hall: text('hall'),
    seatInfo: text('seat_info'),
    /** Datesheet visible to parents only when published. */
    published: boolean('published').notNull().default(false),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('exam_schedules_institution_idx').on(t.institutionId),
    examIdx: index('exam_schedules_exam_idx').on(t.examId),
    classIdx: index('exam_schedules_class_idx').on(t.classId),
    uniq: uniqueIndex('exam_schedule_uniq').on(t.examId, t.classId, t.subjectId),
  }),
);

export type Exam = typeof exams.$inferSelect;
export type NewExam = typeof exams.$inferInsert;
export type ExamSchedule = typeof examSchedules.$inferSelect;
export type NewExamSchedule = typeof examSchedules.$inferInsert;
