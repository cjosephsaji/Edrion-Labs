import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { students } from './people';
import { independentUsers } from './users';

const ownerCheck = (studentId: unknown, independentUserId: unknown) =>
  sql`num_nonnulls(${studentId}, ${independentUserId}) = 1`;

/** Portable personal intent. institution_id is a nullable institutional-context tag, never owner identity. */
export const userObligations = pgTable('user_obligations', {
  id: primaryId(),
  institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'set null' }),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
  independentUserId: uuid('independent_user_id').references(() => independentUsers.id, { onDelete: 'cascade' }),
  source: text('source').notNull().default('self'),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  allDay: boolean('all_day').notNull().default(false),
  status: text('status').notNull().default('pending'),
  deepLink: text('deep_link'),
  doneAt: timestamp('done_at', { withTimezone: true }),
  idempotencyKey: text('idempotency_key'),
  version: integer('version').notNull().default(0),
  ...timestamps,
}, (t) => ({
  ownerXor: check('user_obligations_owner_xor', ownerCheck(t.studentId, t.independentUserId)),
  studentPendingIdx: index('user_obligations_student_pending_idx').on(t.studentId, t.dueAt).where(sql`${t.studentId} is not null and ${t.status} = 'pending'`),
  independentPendingIdx: index('user_obligations_independent_pending_idx').on(t.independentUserId, t.dueAt).where(sql`${t.independentUserId} is not null and ${t.status} = 'pending'`),
  studentIdem: uniqueIndex('user_obligations_student_idem_unique').on(t.studentId, t.idempotencyKey),
  independentIdem: uniqueIndex('user_obligations_independent_idem_unique').on(t.independentUserId, t.idempotencyKey),
}));

/** Feed facts use the same dual-owner contract so independent writers can land without a fork. */
export const feedEvents = pgTable('feed_events', {
  id: primaryId(),
  institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'set null' }),
  campusId: uuid('campus_id'),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
  independentUserId: uuid('independent_user_id').references(() => independentUsers.id, { onDelete: 'cascade' }),
  eventKey: text('event_key').notNull(),
  type: text('type').notNull(),
  sourceModule: text('source_module').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  deepLink: text('deep_link').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ownerXor: check('feed_events_owner_xor', ownerCheck(t.studentId, t.independentUserId)),
  studentEventUnique: uniqueIndex('feed_events_student_event_unique').on(t.studentId, t.eventKey),
  independentEventUnique: uniqueIndex('feed_events_independent_event_unique').on(t.independentUserId, t.eventKey),
  studentTimeline: index('feed_events_student_timeline_idx').on(t.studentId, t.occurredAt.desc(), t.id.desc()),
  independentTimeline: index('feed_events_independent_timeline_idx').on(t.independentUserId, t.occurredAt.desc(), t.id.desc()),
}));

/** Feed-specific preferences; student_preferences is fixed-column and cannot safely hold these domains. */
export const todayPreferences = pgTable('today_preferences', {
  id: primaryId(),
  institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'set null' }),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
  independentUserId: uuid('independent_user_id').references(() => independentUsers.id, { onDelete: 'cascade' }),
  homeStatChips: text('home_stat_chips').array().notNull().default([]),
  moduleNotifications: jsonb('module_notifications').$type<Record<string, boolean>>().notNull().default({}),
  ribbonDismissedIds: text('ribbon_dismissed_ids').array().notNull().default([]),
  lastNudgeAt: timestamp('last_nudge_at', { withTimezone: true }),
  quietHoursOverride: jsonb('quiet_hours_override').$type<{ start: string; end: string } | null>(),
  heldNotificationEvents: jsonb('held_notification_events').$type<Array<Record<string, unknown>>>().notNull().default([]),
  quietReleaseAt: timestamp('quiet_release_at', { withTimezone: true }),
  version: integer('version').notNull().default(0),
  ...timestamps,
}, (t) => ({
  ownerXor: check('today_preferences_owner_xor', ownerCheck(t.studentId, t.independentUserId)),
  studentUnique: uniqueIndex('today_preferences_student_unique').on(t.studentId),
  independentUnique: uniqueIndex('today_preferences_independent_unique').on(t.independentUserId),
}));

export type UserObligation = typeof userObligations.$inferSelect;
export type FeedEvent = typeof feedEvents.$inferSelect;
export type TodayPreference = typeof todayPreferences.$inferSelect;
