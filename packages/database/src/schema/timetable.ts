import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { academicYears, classes, subjects, academicTerms } from './academics';
import { staff, students } from './people';
import { institutionUsers } from './users';

/**
 * INSTITUTION-PORTAL timetable (Phase 5). A recurring weekly slot: a class is taught a subject by
 * a teacher, on a given weekday between a start and end time, in a room. Same tenant convention as
 * the rest of the portal; `.references()` is safe (academics/people never reference timetable).
 *
 * day_of_week: 1 = Monday … 7 = Sunday (validated in zod). One slot per (class, day, start_time).
 * Times are stored as "HH:MM" 24-hour text.
 * kind: teaching | break | lunch — attendance only surfaces teaching slots.
 */
export const timetableSlots = pgTable(
  'timetable_slots',
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
    /** Optional academic year this timetable belongs to. */
    academicYearId: uuid('academic_year_id').references(() => academicYears.id, {
      onDelete: 'set null',
    }),
    /** Optional link to a structured academic term period. */
    termId: uuid('term_id').references(() => academicTerms.id, { onDelete: 'set null' }),
    /** 1 = Monday … 7 = Sunday. */
    dayOfWeek: integer('day_of_week').notNull(),
    /** "HH:MM" 24-hour. */
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    /** Optional period name, e.g. "Period 1". Attendance falls back to startTime when null. */
    label: text('label'),
    /** teaching | break | lunch */
    kind: text('kind').notNull().default('teaching'),
    room: text('room'),
    /** Inclusive effective range; null = full linked term. */
    effectiveFrom: date('effective_from'),
    effectiveTo: date('effective_to'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('timetable_slots_institution_idx').on(t.institutionId),
    scopeIdx: index('timetable_slots_institution_campus_idx').on(t.institutionId, t.campusId),
    classIdx: index('timetable_slots_class_idx').on(t.classId),
    classDayIdx: index('timetable_slots_class_day_idx').on(t.classId, t.dayOfWeek),
    uniq: uniqueIndex('timetable_slot_uniq').on(t.classId, t.dayOfWeek, t.startTime),
  }),
);

export type TimetableSlot = typeof timetableSlots.$inferSelect;
export type NewTimetableSlot = typeof timetableSlots.$inferInsert;

/** Live timetable deviations (cancel / room change / substitution / extra class). Append-only except revocation. */
export const periodExceptions = pgTable(
  'period_exceptions',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id')
      .notNull()
      .references(() => campuses.id, { onDelete: 'restrict' }),
    slotId: uuid('slot_id').references(() => timetableSlots.id, { onDelete: 'restrict' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    recurring: boolean('recurring').notNull().default(false),
    recurringUntil: date('recurring_until'),
    type: text('type').notNull(),
    newRoom: text('new_room'),
    newTeacherId: uuid('new_teacher_id').references(() => staff.id, { onDelete: 'set null' }),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    /** "HH:MM" 24-hour — standalone extra_class only. */
    startTime: text('start_time'),
    endTime: text('end_time'),
    note: text('note'),
    createdBy: uuid('created_by').references(() => institutionUsers.id, { onDelete: 'set null' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => institutionUsers.id, { onDelete: 'set null' }),
    revokedReason: text('revoked_reason'),
    version: integer('version').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    typeCheck: check(
      'period_exceptions_type_check',
      sql`${t.type} IN ('cancelled', 'room_change', 'substitution', 'extra_class')`,
    ),
    revokedReasonCheck: check(
      'period_exceptions_revoked_reason_check',
      sql`${t.revokedReason} IS NULL OR ${t.revokedReason} IN ('manual', 'superseded', 'slot_deleted')`,
    ),
    noteLengthCheck: check(
      'period_exceptions_note_length_check',
      sql`${t.note} IS NULL OR char_length(${t.note}) <= 200`,
    ),
    institutionClassDateIdx: index('period_exceptions_institution_class_date_idx').on(
      t.institutionId,
      t.classId,
      t.date,
    ),
    institutionSlotLiveIdx: index('period_exceptions_institution_slot_live_idx')
      .on(t.institutionId, t.slotId)
      .where(sql`${t.revokedAt} IS NULL`),
    institutionDateLiveIdx: index('period_exceptions_institution_date_live_idx')
      .on(t.institutionId, t.date)
      .where(sql`${t.revokedAt} IS NULL`),
    institutionTeacherLiveIdx: index('period_exceptions_institution_teacher_live_idx')
      .on(t.institutionId, t.newTeacherId)
      .where(sql`${t.revokedAt} IS NULL`),
  }),
);

/** Per-student secret URL credential for ICS calendar export. */
export const icsTokens = pgTable(
  'ics_tokens',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    tokenUniq: uniqueIndex('ics_tokens_token_uniq').on(t.token),
    studentActiveUniq: uniqueIndex('ics_tokens_student_active_uniq')
      .on(t.studentId)
      .where(sql`${t.revokedAt} IS NULL`),
    institutionStudentIdx: index('ics_tokens_institution_student_idx').on(
      t.institutionId,
      t.studentId,
    ),
  }),
);

export type PeriodException = typeof periodExceptions.$inferSelect;
export type NewPeriodException = typeof periodExceptions.$inferInsert;
export type IcsToken = typeof icsTokens.$inferSelect;
export type NewIcsToken = typeof icsTokens.$inferInsert;
