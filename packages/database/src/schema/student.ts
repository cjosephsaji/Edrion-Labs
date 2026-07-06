import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { students } from './people';
import { independentUsers, institutionUsers } from './users';

/** Independent learner sessions (portal_sessions minus institution columns). */
export const independentSessions = pgTable(
  'independent_sessions',
  {
    id: primaryId(),
    independentUserId: uuid('independent_user_id')
      .notNull()
      .references(() => independentUsers.id, { onDelete: 'cascade' }),
    aal: text('aal').notNull().default('aal1'),
    lastAuthAt: timestamp('last_auth_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    ...timestamps,
  },
  (t) => ({
    userIdx: index('independent_sessions_user_idx').on(t.independentUserId),
    liveIdx: index('independent_sessions_live_idx').on(t.revokedAt, t.expiresAt),
  }),
);

/** Append-only learning activity ledger. */
export const learningEvents = pgTable(
  'learning_events',
  {
    id: primaryId(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    actorKind: text('actor_kind').notNull().default('student'),
    actorId: uuid('actor_id'),
    eventType: text('event_type').notNull(),
    topicKey: text('topic_key'),
    subjectLabel: text('subject_label'),
    contextType: text('context_type'),
    contextId: uuid('context_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    requestId: text('request_id'),
  },
  (t) => ({
    studentTimeIdx: index('learning_events_student_time_idx').on(t.studentId, t.occurredAt),
    indepTimeIdx: index('learning_events_indep_time_idx').on(t.independentUserId, t.occurredAt),
    typeTimeIdx: index('learning_events_type_time_idx').on(t.eventType, t.occurredAt),
    topicIdx: index('learning_events_topic_idx').on(t.topicKey),
  }),
);

/** Generalized object storage metadata for student portal features. */
export const storageObjects = pgTable(
  'storage_objects',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    ownerStudentId: uuid('owner_student_id').references(() => students.id, { onDelete: 'set null' }),
    ownerIndependentUserId: uuid('owner_independent_user_id').references(() => independentUsers.id, {
      onDelete: 'set null',
    }),
    ownerStaffUserId: uuid('owner_staff_user_id').references(() => institutionUsers.id, {
      onDelete: 'set null',
    }),
    kind: text('kind').notNull(),
    driver: text('driver').notNull(),
    storageKey: text('storage_key').notNull(),
    filename: text('filename'),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    checksumSha256: text('checksum_sha256'),
    processingStatus: text('processing_status').notNull().default('uploaded'),
    processingError: text('processing_error'),
    derived: jsonb('derived').$type<Record<string, unknown>>().notNull().default({}),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    instIdx: index('storage_objects_inst_idx').on(t.institutionId),
    ownerStudentIdx: index('storage_objects_owner_student_idx').on(t.ownerStudentId),
    ownerIndepIdx: index('storage_objects_owner_indep_idx').on(t.ownerIndependentUserId),
    kindIdx: index('storage_objects_kind_idx').on(t.kind),
  }),
);

/** Per-student UI and learning preferences. */
export const studentPreferences = pgTable(
  'student_preferences',
  {
    id: primaryId(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    theme: text('theme').notNull().default('standard'),
    matchSystem: boolean('match_system').notNull().default(false),
    textSize: text('text_size').notNull().default('M'),
    reducedMotion: boolean('reduced_motion').notNull().default(false),
    hintGenerosity: text('hint_generosity').notNull().default('balanced'),
    celebration: text('celebration').notNull().default('warm'),
    weeklyGoal: integer('weekly_goal').notNull().default(8),
    quietHours: jsonb('quiet_hours').$type<{ start: string; end: string } | null>(),
    notifSessionReminders: boolean('notif_session_reminders').notNull().default(true),
    notifRevisionDue: boolean('notif_revision_due').notNull().default(true),
    notifAnnouncements: boolean('notif_announcements').notNull().default(true),
    language: text('language').notNull().default('en'),
    expertMode: boolean('expert_mode').notNull().default(false),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    studentUq: uniqueIndex('student_preferences_student_uq').on(t.studentId),
    indepUq: uniqueIndex('student_preferences_indep_uq').on(t.independentUserId),
  }),
);

/** Institution-authored content pages exposed via the student surface registry. */
export const studentContentPages = pgTable(
  'student_content_pages',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),
    pageKey: text('page_key').notNull(),
    title: text('title').notNull(),
    bodyRichtext: jsonb('body_richtext').$type<unknown[]>().notNull().default([]),
    attachmentIds: jsonb('attachment_ids').$type<string[]>().notNull().default([]),
    audience: jsonb('audience').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('student_content_pages_inst_idx').on(t.institutionId),
    pageKeyUq: uniqueIndex('student_content_pages_inst_page_key_uq').on(t.institutionId, t.pageKey),
  }),
);

export type IndependentSession = typeof independentSessions.$inferSelect;
export type LearningEvent = typeof learningEvents.$inferSelect;
export type StorageObject = typeof storageObjects.$inferSelect;
export type StudentPreference = typeof studentPreferences.$inferSelect;
export type StudentContentPage = typeof studentContentPages.$inferSelect;
