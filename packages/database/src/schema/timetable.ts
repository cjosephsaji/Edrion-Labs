import { index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { academicYears, classes, subjects, academicTerms } from './academics';
import { staff } from './people';

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
