import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { students } from './people';
import { institutionUsers } from './users';

/**
 * PARENT-PORTAL communication tables. All new parent-portal-owned tables carry a `parent_`-prefixed
 * name (or a clearly parent-domain name) to avoid colliding with the existing staff-side
 * `messages` / `message_threads` / `notifications` tables. Same tenant convention as the rest of the
 * schema: id, institution_id (ALWAYS), campus_id where meaningful, version, actorColumns, timestamps.
 * Parent RLS is the standard institution GUC predicate AND an active student_guardians join enforced
 * at the service layer by GuardianScopeGuard (see apps/api parent-portal module).
 */

/** A notice broadcast to a parent audience. Markdown body, optional acknowledgement + attachments. */
export const parentNotices = pgTable(
  'parent_notices',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** Markdown. */
    body: text('body').notNull(),
    /** institution | campus | grade_level | class | transport_route | hostel_block | custom. */
    audienceScope: text('audience_scope').notNull().default('institution'),
    /** The id the scope points at (grade level / class / route / block …). Null for institution/custom. */
    audienceRefId: uuid('audience_ref_id'),
    requiresAcknowledgement: boolean('requires_acknowledgement').notNull().default(false),
    /** [{name,url,storageKey,contentType,bytes}]. */
    attachments: jsonb('attachments').$type<unknown[]>().notNull().default([]),
    /** normal | important. */
    priority: text('priority').notNull().default('normal'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('parent_notices_institution_idx').on(t.institutionId),
    scopeIdx: index('parent_notices_institution_campus_idx').on(t.institutionId, t.campusId),
    publishedIdx: index('parent_notices_published_idx').on(t.institutionId, t.publishedAt),
  }),
);

/** Per-(notice, guardian, student) read/acknowledge receipt. Append-only in spirit (upserted once). */
export const parentNoticeReceipts = pgTable(
  'parent_notice_receipts',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    noticeId: uuid('notice_id')
      .notNull()
      .references(() => parentNotices.id, { onDelete: 'cascade' }),
    guardianUserId: uuid('guardian_user_id')
      .notNull()
      .references(() => institutionUsers.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    noticeIdx: index('parent_notice_receipts_notice_idx').on(t.noticeId),
    guardianIdx: index('parent_notice_receipts_guardian_idx').on(t.guardianUserId),
    uniq: uniqueIndex('parent_notice_receipt_uniq').on(t.noticeId, t.guardianUserId, t.studentId),
  }),
);

/** A structured parent↔school message thread about one student. Not open chat — category-routed. */
export const parentMessageThreads = pgTable(
  'parent_message_threads',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    openedByGuardianId: uuid('opened_by_guardian_id')
      .notNull()
      .references(() => institutionUsers.id, { onDelete: 'cascade' }),
    /** callback_request | class_teacher_note | fees_query | transport_query | health_query | general. */
    category: text('category').notNull().default('general'),
    subject: text('subject').notNull(),
    /** open | answered | closed. */
    status: text('status').notNull().default('open'),
    /** Routed assignee (institution_users id): class teacher for teacher notes, role inbox otherwise. */
    assignedTo: uuid('assigned_to').references(() => institutionUsers.id, { onDelete: 'set null' }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('parent_message_threads_institution_idx').on(t.institutionId),
    studentIdx: index('parent_message_threads_student_idx').on(t.studentId),
    guardianIdx: index('parent_message_threads_guardian_idx').on(t.openedByGuardianId),
    assignedIdx: index('parent_message_threads_assigned_idx').on(t.assignedTo),
  }),
);

/** A single message within a parent thread. */
export const parentMessages = pgTable(
  'parent_messages',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => parentMessageThreads.id, { onDelete: 'cascade' }),
    /** guardian | staff. */
    senderType: text('sender_type').notNull(),
    senderId: uuid('sender_id').notNull(),
    body: text('body').notNull(),
    attachments: jsonb('attachments').$type<unknown[]>().notNull().default([]),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => ({
    threadIdx: index('parent_messages_thread_idx').on(t.threadId, t.sentAt),
  }),
);

/**
 * An emergency broadcast to a parent audience. Append-only. Creation requires a sensitive permission
 * key + recent-auth + a typed confirmation phrase (enforced in the controller, not here).
 */
export const parentEmergencyBroadcasts = pgTable(
  'parent_emergency_broadcasts',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** urgent | critical. */
    severity: text('severity').notNull().default('urgent'),
    audienceScope: text('audience_scope').notNull().default('institution'),
    audienceRefId: uuid('audience_ref_id'),
    /** {email,sms,whatsapp,push}. */
    channels: jsonb('channels').$type<Record<string, boolean>>().notNull().default({}),
    sentBy: uuid('sent_by')
      .notNull()
      .references(() => institutionUsers.id, { onDelete: 'set null' }),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => ({
    instIdx: index('parent_emergency_broadcasts_institution_idx').on(t.institutionId, t.sentAt),
  }),
);

/** Institution-defined calendar event type (swatch key). */
export const calendarEventTypes = pgTable(
  'calendar_event_types',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    /** Named swatch key (red|amber|green|…), not hex. */
    color: text('color').notNull().default('green'),
    icon: text('icon'),
    isSystem: boolean('is_system').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('calendar_event_types_institution_idx').on(t.institutionId),
    uniq: uniqueIndex('calendar_event_types_institution_key_uniq').on(t.institutionId, t.key),
  }),
);

/** A school calendar entry. Feeds the portal calendar + overlays. Institution/campus scoped. */
export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** Legacy text type — kept through backfill; prefer eventTypeId. */
    type: text('type').notNull().default('event'),
    eventTypeId: uuid('event_type_id').references(() => calendarEventTypes.id, {
      onDelete: 'restrict',
    }),
    /** Local calendar date (not timestamptz). */
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on'),
    /** "HH:MM"; null = all-day. */
    startTime: text('start_time'),
    endTime: text('end_time'),
    status: text('status').notNull().default('published'),
    sourceRef: jsonb('source_ref').$type<Record<string, unknown>>(),
    audienceScope: text('audience_scope').notNull().default('institution'),
    audienceRefId: uuid('audience_ref_id'),
    description: text('description'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('calendar_events_institution_idx').on(t.institutionId),
    rangeIdx: index('calendar_events_range_idx').on(t.institutionId, t.startsOn),
    typeIdx: index('calendar_events_event_type_idx').on(t.institutionId, t.eventTypeId),
  }),
);

export type ParentNotice = typeof parentNotices.$inferSelect;
export type NewParentNotice = typeof parentNotices.$inferInsert;
export type ParentNoticeReceipt = typeof parentNoticeReceipts.$inferSelect;
export type NewParentNoticeReceipt = typeof parentNoticeReceipts.$inferInsert;
export type ParentMessageThread = typeof parentMessageThreads.$inferSelect;
export type NewParentMessageThread = typeof parentMessageThreads.$inferInsert;
export type ParentMessage = typeof parentMessages.$inferSelect;
export type NewParentMessage = typeof parentMessages.$inferInsert;
export type ParentEmergencyBroadcast = typeof parentEmergencyBroadcasts.$inferSelect;
export type NewParentEmergencyBroadcast = typeof parentEmergencyBroadcasts.$inferInsert;
export type CalendarEventType = typeof calendarEventTypes.$inferSelect;
export type NewCalendarEventType = typeof calendarEventTypes.$inferInsert;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type NewCalendarEvent = typeof calendarEvents.$inferInsert;
