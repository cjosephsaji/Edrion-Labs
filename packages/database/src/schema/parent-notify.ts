import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { students } from './people';
import { institutionUsers } from './users';

/**
 * PARENT-PORTAL notification + digest tables.
 *  - parent_notifications: the in-app feed + fanout ledger. Append-only.
 *  - parent_notification_preferences: per-guardian channel/category/quiet-hours settings.
 *  - parent_digest_runs / parent_digest_deliveries: weekly-digest job bookkeeping (deliveries append-only).
 */

/** One notification for one guardian (optionally about one student). Append-only, feed-ordered. */
export const parentNotifications = pgTable(
  'parent_notifications',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    guardianUserId: uuid('guardian_user_id')
      .notNull()
      .references(() => institutionUsers.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    /** Event type enum — mirrors the fanout producer set (medical_incident, gate_exit, fee_overdue, …). */
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    /** In-app deep link, e.g. /child/<id>/health. */
    deepLink: text('deep_link'),
    /** immediate | digest. */
    priority: text('priority').notNull().default('immediate'),
    /** Source row this notification derived from: "<table>:<id>". */
    sourceEntity: text('source_entity'),
    readAt: timestamp('read_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    feedIdx: index('parent_notifications_feed_idx').on(t.guardianUserId, t.createdAt),
    unreadIdx: index('parent_notifications_unread_idx').on(t.guardianUserId, t.readAt),
  }),
);

/** Per-guardian notification preferences (channels, category overrides, digest, quiet hours). */
export const parentNotificationPreferences = pgTable(
  'parent_notification_preferences',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    guardianUserId: uuid('guardian_user_id')
      .notNull()
      .references(() => institutionUsers.id, { onDelete: 'cascade' }),
    /** {email,sms,whatsapp,push} booleans. */
    channels: jsonb('channels')
      .$type<Record<string, boolean>>()
      .notNull()
      .default({ email: true, push: true, sms: false, whatsapp: false }),
    /** Per-category channel overrides: {<category>: {email,sms,...}}. */
    categoryOverrides: jsonb('category_overrides').$type<Record<string, unknown>>().notNull().default({}),
    /** 0=Sunday … 6=Saturday. */
    digestDay: integer('digest_day').notNull().default(1),
    digestEnabled: boolean('digest_enabled').notNull().default(true),
    /** {start:"22:00",end:"07:00"} in institution timezone; safety/medical alerts ignore this. */
    quietHours: jsonb('quiet_hours').$type<Record<string, string>>().notNull().default({}),
    language: text('language').notNull().default('en'),
    ...timestamps,
  },
  (t) => ({
    guardianUniq: uniqueIndex('parent_notification_prefs_guardian_uniq').on(t.guardianUserId),
  }),
);

/** One weekly-digest job run for one institution. */
export const parentDigestRuns = pgTable(
  'parent_digest_runs',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    /** ISO date the digest window ends (the run's "as-of"). */
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    /** scheduled | running | completed | failed. */
    status: text('status').notNull().default('scheduled'),
    guardianCount: integer('guardian_count').notNull().default(0),
    deliveredCount: integer('delivered_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    error: text('error'),
    ...timestamps,
  },
  (t) => ({
    instIdx: index('parent_digest_runs_institution_idx').on(t.institutionId, t.createdAt),
  }),
);

/** One digest delivery to one guardian on one channel. Append-only. */
export const parentDigestDeliveries = pgTable(
  'parent_digest_deliveries',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').references(() => parentDigestRuns.id, { onDelete: 'cascade' }),
    guardianUserId: uuid('guardian_user_id')
      .notNull()
      .references(() => institutionUsers.id, { onDelete: 'cascade' }),
    /** email | sms | whatsapp | push. */
    channel: text('channel').notNull(),
    /** sha256 of the rendered payload (dedupe / audit). */
    payloadHash: text('payload_hash'),
    /** queued | sent | failed | skipped. */
    status: text('status').notNull().default('queued'),
    error: text('error'),
    ...timestamps,
  },
  (t) => ({
    runIdx: index('parent_digest_deliveries_run_idx').on(t.runId),
    guardianIdx: index('parent_digest_deliveries_guardian_idx').on(t.guardianUserId, t.createdAt),
  }),
);

export type ParentNotification = typeof parentNotifications.$inferSelect;
export type NewParentNotification = typeof parentNotifications.$inferInsert;
export type ParentNotificationPreference = typeof parentNotificationPreferences.$inferSelect;
export type NewParentNotificationPreference = typeof parentNotificationPreferences.$inferInsert;
export type ParentDigestRun = typeof parentDigestRuns.$inferSelect;
export type NewParentDigestRun = typeof parentDigestRuns.$inferInsert;
export type ParentDigestDelivery = typeof parentDigestDeliveries.$inferSelect;
export type NewParentDigestDelivery = typeof parentDigestDeliveries.$inferInsert;
