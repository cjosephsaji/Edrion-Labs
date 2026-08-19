import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_helpers';
import { campuses } from './campuses';
import { institutions } from './institutions';
import { students } from './people';

export const petrosStudentThreads = pgTable(
  'petros_student_threads',
  {
    id: primaryId(),
    schemaVersion: text('schema_version').notNull(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    title: text('title'),
    activeTopic: text('active_topic'),
    activeFocusRef: text('active_focus_ref'),
    summary: text('summary'),
    summaryWatermark: integer('summary_watermark').notNull().default(0),
    status: text('status').notNull().default('active'),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    purgeAfter: timestamp('purge_after', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    ownerActivityIdx: index('petros_student_threads_owner_activity_idx').on(
      t.institutionId,
      t.studentId,
      t.lastActivityAt,
    ),
  }),
);

export const petrosStudentMessages = pgTable(
  'petros_student_messages',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => petrosStudentThreads.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    blocks: jsonb('blocks').$type<unknown[]>().notNull().default([]),
    route: text('route'),
    surface: text('surface'),
    focusRef: text('focus_ref'),
    status: text('status').notNull().default('complete'),
    idempotencyKey: uuid('idempotency_key').notNull(),
    promptVersion: text('prompt_version'),
    schemaVersion: text('schema_version'),
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerKeyRoleUniq: uniqueIndex('petros_student_messages_owner_key_role_uniq').on(
      t.institutionId,
      t.studentId,
      t.idempotencyKey,
      t.role,
    ),
    threadSeqIdx: index('petros_student_messages_thread_seq_idx').on(t.threadId, t.seq),
  }),
);

export const petrosStudentActionProposals = pgTable(
  'petros_student_action_proposals',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => petrosStudentThreads.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => petrosStudentMessages.id, {
      onDelete: 'set null',
    }),
    actionKey: text('action_key').notNull(),
    arguments: jsonb('arguments').$type<Record<string, unknown>>().notNull().default({}),
    preview: jsonb('preview').$type<string[]>().notNull().default([]),
    confirmationRequired: boolean('confirmation_required').notNull().default(true),
    status: text('status').notNull().default('proposed'),
    resultRef: text('result_ref'),
    failureReason: text('failure_reason'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    executionKey: uuid('execution_key'),
    ...timestamps,
  },
  (t) => ({
    execKeyUniq: uniqueIndex('petros_student_action_exec_key_uniq').on(
      t.institutionId,
      t.studentId,
      t.executionKey,
    ),
    threadIdx: index('petros_student_action_thread_idx').on(t.threadId, t.createdAt),
  }),
);

export const petrosStudentCompanionPreferences = pgTable(
  'petros_student_companion_preferences',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    preferredName: text('preferred_name'),
    responseDepth: text('response_depth').notNull().default('balanced'),
    energy: text('energy').notNull().default('warm'),
    humour: text('humour').notNull().default('light'),
    proactiveCheckIns: boolean('proactive_check_ins').notNull().default(true),
    language: text('language').notNull().default('en'),
    quietMode: boolean('quiet_mode').notNull().default(false),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    ownerUniq: uniqueIndex('petros_student_companion_prefs_owner_uniq').on(
      t.institutionId,
      t.studentId,
    ),
  }),
);

export const petrosStudentNudgeState = pgTable(
  'petros_student_nudge_state',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    nudgeKey: text('nudge_key').notNull(),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }).notNull().defaultNow(),
    suppressUntil: timestamp('suppress_until', { withTimezone: true }).notNull(),
  },
  (t) => ({
    ownerKeyUniq: uniqueIndex('petros_student_nudge_state_owner_key_uniq').on(
      t.institutionId,
      t.studentId,
      t.nudgeKey,
    ),
  }),
);
