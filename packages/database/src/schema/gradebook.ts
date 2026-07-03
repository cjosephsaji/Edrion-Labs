import { boolean, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { classes, subjects } from './academics';
import { students } from './people';
import { exams } from './exams';

/**
 * INSTITUTION-PORTAL gradebook (Phase 6). A flat table of marks — one row is one student's score on
 * one assessment of one subject, optionally tied to an exam. Same tenant convention as the rest of
 * the portal; classes/subjects/students/exams are forward-only, so plain `.references()` is safe.
 *
 * Marks are whole numbers (`integer`), consistent with the rest of the portal (no decimals anywhere).
 * `gradebook.manage` is sensitive. A (student, subject, exam) is unique when an exam is set; the
 * service pre-checks for a friendly 409 (Postgres treats NULL exam_id as distinct, so ad-hoc
 * assessments without an exam are never blocked).
 */
export const gradeEntries = pgTable(
  'grade_entries',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    /** Optional exam this grade belongs to. */
    examId: uuid('exam_id').references(() => exams.id, { onDelete: 'set null' }),
    /** Optional class context. */
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
    /** Label for the assessment, e.g. "Midterm" — used when not tied to an exam. */
    assessmentName: text('assessment_name').notNull(),
    marksObtained: integer('marks_obtained').notNull().default(0),
    maxMarks: integer('max_marks').notNull().default(100),
    /** Optional letter/grade, e.g. "A", "B+". */
    letterGrade: text('letter_grade'),
    remarks: text('remarks'),
    /** Parent-portal publish gate: results are visible to guardians only when published. */
    published: boolean('published').notNull().default(false),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('grade_entries_institution_idx').on(t.institutionId),
    scopeIdx: index('grade_entries_institution_campus_idx').on(t.institutionId, t.campusId),
    studentIdx: index('grade_entries_student_idx').on(t.studentId),
    examIdx: index('grade_entries_exam_idx').on(t.examId),
    uniq: uniqueIndex('grade_entry_uniq').on(t.studentId, t.subjectId, t.examId),
  }),
);

export type GradeEntry = typeof gradeEntries.$inferSelect;
export type NewGradeEntry = typeof gradeEntries.$inferInsert;
