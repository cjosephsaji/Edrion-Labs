import {
  boolean,
  check,
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
import { sql } from 'drizzle-orm';
import { primaryId, timestamps } from './_helpers';
import { academicTerms, subjects } from './academics';
import { campuses } from './campuses';
import { classes } from './academics';
import { institutions } from './institutions';
import { students } from './people';
import { studentRequests } from './requests';
import { timetableSlots } from './timetable';

export const ATTENDANCE_MARK_STATUSES = [
  'present',
  'absent',
  'late',
  'excused',
  'left_early',
  'od',
] as const;

export type AttendanceMarkStatus = (typeof ATTENDANCE_MARK_STATUSES)[number];

export const attendancePolicies = pgTable(
  'attendance_policies',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    thresholdPct: numeric('threshold_pct').notNull().default('75'),
    safeMarginPct: numeric('safe_margin_pct').notNull().default('5'),
    odBasis: text('od_basis').notNull().default('present'),
    excusedBasis: text('excused_basis').notNull().default('excluded'),
    lateCountsAs: text('late_counts_as').notNull().default('present'),
    leftEarlyCountsAs: text('left_early_counts_as').notNull().default('present'),
    computationBasis: text('computation_basis').notNull().default('conducted'),
    leaveMark: text('leave_mark').notNull().default('excused'),
    correctionWindowDays: integer('correction_window_days').notNull().default(14),
    condonationEnabled: boolean('condonation_enabled').notNull().default(true),
    parentVisibility: text('parent_visibility').notNull().default('off'),
    workingDaysMask: integer('working_days_mask').notNull().default(63),
    version: integer('version').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    institutionDefaultUniq: uniqueIndex('attendance_policies_institution_default_uniq')
      .on(t.institutionId)
      .where(sql`${t.campusId} is null`),
    institutionCampusUniq: uniqueIndex('attendance_policies_institution_campus_uniq')
      .on(t.institutionId, t.campusId)
      .where(sql`${t.campusId} is not null`),
    instIdx: index('attendance_policies_institution_idx').on(t.institutionId),
    thresholdCheck: check(
      'attendance_policies_threshold_pct_check',
      sql`${t.thresholdPct} >= 1 AND ${t.thresholdPct} <= 100`,
    ),
    safeMarginCheck: check(
      'attendance_policies_safe_margin_pct_check',
      sql`${t.safeMarginPct} >= 0 AND ${t.safeMarginPct} <= 50`,
    ),
    odBasisCheck: check('attendance_policies_od_basis_check', sql`${t.odBasis} IN ('present', 'excluded')`),
    excusedBasisCheck: check(
      'attendance_policies_excused_basis_check',
      sql`${t.excusedBasis} IN ('present', 'excluded')`,
    ),
    lateCountsAsCheck: check(
      'attendance_policies_late_counts_as_check',
      sql`${t.lateCountsAs} IN ('present', 'absent')`,
    ),
    leftEarlyCountsAsCheck: check(
      'attendance_policies_left_early_counts_as_check',
      sql`${t.leftEarlyCountsAs} IN ('present', 'absent')`,
    ),
    computationBasisCheck: check(
      'attendance_policies_computation_basis_check',
      sql`${t.computationBasis} IN ('conducted', 'scheduled')`,
    ),
    leaveMarkCheck: check('attendance_policies_leave_mark_check', sql`${t.leaveMark} IN ('excused', 'od')`),
    parentVisibilityCheck: check(
      'attendance_policies_parent_visibility_check',
      sql`${t.parentVisibility} IN ('on', 'off')`,
    ),
  }),
);

export type AttendanceForecast = {
  branch: 'can_miss' | 'edge' | 'recovery' | 'unrecoverable' | 'none';
  n: number;
};

export const attendanceRollups = pgTable(
  'attendance_rollups',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    termId: uuid('term_id')
      .notNull()
      .references(() => academicTerms.id, { onDelete: 'cascade' }),
    attended: integer('attended').notNull().default(0),
    conducted: integer('conducted').notNull().default(0),
    remaining: integer('remaining').notNull().default(0),
    pct: numeric('pct'),
    forecast: jsonb('forecast').$type<AttendanceForecast>().notNull().default({ branch: 'none', n: 0 }),
    zone: text('zone').notNull().default('safe'),
    recoveredToastPending: boolean('recovered_toast_pending').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    studentSubjectTermUniq: uniqueIndex('attendance_rollups_student_subject_term_uniq')
      .on(t.studentId, t.subjectId, t.termId)
      .where(sql`${t.subjectId} is not null`),
    studentOverallTermUniq: uniqueIndex('attendance_rollups_student_overall_term_uniq')
      .on(t.studentId, t.termId)
      .where(sql`${t.subjectId} is null`),
    institutionTermIdx: index('attendance_rollups_institution_term_idx').on(t.institutionId, t.termId),
    zoneCheck: check(
      'attendance_rollups_zone_check',
      sql`${t.zone} IN ('safe', 'warning', 'below', 'unrecoverable')`,
    ),
  }),
);

export const requestMarksPending = pgTable(
  'request_marks_pending',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    requestId: uuid('request_id')
      .notNull()
      .references(() => studentRequests.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    occurrenceDate: date('occurrence_date').notNull(),
    slotId: uuid('slot_id').references(() => timetableSlots.id, { onDelete: 'set null' }),
    targetMark: text('target_mark').notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    institutionDateIdx: index('request_marks_pending_institution_date_idx')
      .on(t.institutionId, t.occurrenceDate)
      .where(sql`${t.appliedAt} is null`),
    targetMarkCheck: check(
      'request_marks_pending_target_mark_check',
      sql`${t.targetMark} IN ('present', 'absent', 'late', 'excused', 'left_early', 'od')`,
    ),
  }),
);

export type AttendancePolicy = typeof attendancePolicies.$inferSelect;
export type NewAttendancePolicy = typeof attendancePolicies.$inferInsert;
export type AttendanceRollup = typeof attendanceRollups.$inferSelect;
export type NewAttendanceRollup = typeof attendanceRollups.$inferInsert;
export type RequestMarkPending = typeof requestMarksPending.$inferSelect;
export type NewRequestMarkPending = typeof requestMarksPending.$inferInsert;
