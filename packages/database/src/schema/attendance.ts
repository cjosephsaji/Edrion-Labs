import { date, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { classes, subjects } from './academics';
import { students, teachers } from './people';

/**
 * INSTITUTION-PORTAL attendance (Phase 5). A two-level model:
 *   - attendance_sessions: ONE register for a class on a date (+ optional subject/period). Owns
 *     the date, who took it, and any notes. Always campus-scoped (stamped on create).
 *   - attendance_records: the per-student status WITHIN a session. No campus column of its own —
 *     it inherits the session's campus, and the service confines reads/writes through the session.
 *
 * Same tenant convention + `.references()` (sessions/classes/students/subjects/teachers are all
 * forward-only from attendance, so no Drizzle type cycle). One register per (class, date, period).
 */
export const attendanceSessions = pgTable(
  'attendance_sessions',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    /** Optional subject — null = homeroom / whole-day register. */
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    date: date('date').notNull(),
    /** Period label, e.g. "1" or "full_day". Part of the per-day uniqueness key. */
    period: text('period').notNull().default('full_day'),
    /** Who took the register — a teacher. */
    takenById: uuid('taken_by_id').references(() => teachers.id, { onDelete: 'set null' }),
    notes: text('notes'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('attendance_sessions_institution_idx').on(t.institutionId),
    scopeIdx: index('attendance_sessions_institution_campus_idx').on(t.institutionId, t.campusId),
    classIdx: index('attendance_sessions_class_idx').on(t.classId),
    dateIdx: index('attendance_sessions_date_idx').on(t.date),
    uniq: uniqueIndex('attendance_session_uniq').on(t.classId, t.date, t.period),
  }),
);

/** Per-student attendance within a session. Upserted on (session, student). */
export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => attendanceSessions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    /** present | absent | late | excused | left_early. */
    status: text('status').notNull().default('present'),
    remarks: text('remarks'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('attendance_records_institution_idx').on(t.institutionId),
    sessionIdx: index('attendance_records_session_idx').on(t.sessionId),
    studentIdx: index('attendance_records_student_idx').on(t.studentId),
    uniq: uniqueIndex('attendance_record_uniq').on(t.sessionId, t.studentId),
  }),
);

export type AttendanceSession = typeof attendanceSessions.$inferSelect;
export type NewAttendanceSession = typeof attendanceSessions.$inferInsert;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type NewAttendanceRecord = typeof attendanceRecords.$inferInsert;
