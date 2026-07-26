import { boolean, date, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { students } from './people';
import { independentUsers } from './users';

export const examProfiles = pgTable('exam_profiles', {
  id: primaryId(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  family: text('family').notNull(),
  status: text('status').notNull().default('draft'),
  contentStrategy: text('content_strategy').notNull().default('authored_to_framework'),
  deliveryProfileKey: text('delivery_profile_key').notNull().default('standard'),
  version: integer('version').notNull().default(1),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
});

export const prepEnrollments = pgTable(
  'prep_enrollments',
  {
    id: primaryId(),
    examProfileId: uuid('exam_profile_id')
      .notNull()
      .references(() => examProfiles.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    status: text('status').notNull().default('active'),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    ownerProfileUq: uniqueIndex('prep_enrollments_owner_profile_uq').on(
      t.examProfileId,
      t.studentId,
      t.independentUserId,
    ),
  }),
);

export const prepPlans = pgTable('prep_plans', {
  id: primaryId(),
  enrollmentId: uuid('enrollment_id')
    .notNull()
    .references(() => prepEnrollments.id, { onDelete: 'cascade' }),
  institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
  independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
    onDelete: 'cascade',
  }),
  weekStart: date('week_start').notNull(),
  status: text('status').notNull().default('active'),
  generatorVersion: text('generator_version').notNull().default('1.0.0'),
  version: integer('version').notNull().default(1),
  ...timestamps,
});

export const prepPlanBlocks = pgTable('prep_plan_blocks', {
  id: primaryId(),
  planId: uuid('plan_id')
    .notNull()
    .references(() => prepPlans.id, { onDelete: 'cascade' }),
  blockDate: date('block_date').notNull(),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  sortOrder: integer('sort_order').notNull().default(0),
  obligationSynced: boolean('obligation_synced').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const prepErrorNotebookEntries = pgTable('prep_error_notebook_entries', {
  id: primaryId(),
  institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
  independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
    onDelete: 'cascade',
  }),
  sourceKind: text('source_kind').notNull(),
  attemptId: uuid('attempt_id'),
  questionId: uuid('question_id'),
  tags: jsonb('tags').$type<unknown[]>().notNull().default([]),
  note: text('note'),
  resolution: text('resolution'),
  version: integer('version').notNull().default(1),
  ...timestamps,
});

export const prepDiagnosticRuns = pgTable('prep_diagnostic_runs', {
  id: primaryId(),
  enrollmentId: uuid('enrollment_id')
    .notNull()
    .references(() => prepEnrollments.id, { onDelete: 'cascade' }),
  mockAttemptId: uuid('mock_attempt_id'),
  status: text('status').notNull().default('pending'),
  summary: jsonb('summary').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const prepExamDayCards = pgTable('prep_exam_day_cards', {
  id: primaryId(),
  enrollmentId: uuid('enrollment_id')
    .notNull()
    .references(() => prepEnrollments.id, { onDelete: 'cascade' }),
  examDate: date('exam_date').notNull(),
  checklist: jsonb('checklist').$type<unknown[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
