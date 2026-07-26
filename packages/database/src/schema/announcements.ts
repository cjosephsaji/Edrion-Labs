import { boolean, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';

/**
 * INSTITUTION-PORTAL announcements + notifications (Phase 9). Two flat, campus-scoped, version-guarded
 * tables with a small publish→notify bridge:
 *   - announcements: a notice authored for an audience. `reference_code` is unique within the
 *     institution (a friendly 409 instead of a unique-index 500). Publishing an announcement stamps
 *     `published_at`/status and fans out a notification row (the bridge, like admissions→enrol).
 *   - notifications: the per-recipient-audience feed. A notification may be linked back to the
 *     announcement that produced it (`announcement_id`, optional + pre-checked for a friendly 400);
 *     marking one read stamps `read_at`. No dedicated permission key exists — the portal gates the
 *     notifications feed with `announcements.view` (read) / `announcements.send` (mutate).
 *
 * Same tenant convention as the rest of the portal; both reference only institutions/campuses, so plain
 * `.references()` is safe (no Drizzle type cycle).
 */
export const announcements = pgTable(
  'announcements',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body'),
    /** Unique within the institution — a human reference (friendly 409 on collision). */
    referenceCode: text('reference_code').notNull(),
    /** all | teachers | students | parents | staff. */
    audience: text('audience').notNull().default('all'),
    category: text('category'),
    /** draft | published | archived. */
    status: text('status').notNull().default('draft'),
    pinned: boolean('pinned').notNull().default(false),
    /** Intended publish date (free-scheduling hint). */
    publishAt: date('publish_at'),
    /** Stamped when the announcement is actually published (the bridge). */
    publishedAt: timestamp('published_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('announcements_institution_idx').on(t.institutionId),
    scopeIdx: index('announcements_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('announcements_status_idx').on(t.status),
    codeUniq: uniqueIndex('announcement_code_uniq').on(t.institutionId, t.referenceCode),
  }),
);

/** The notification feed. Campus-scoped + version-guarded; optionally linked to an announcement. */
export const notifications = pgTable(
  'notifications',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body'),
    /** system | announcement | alert. */
    kind: text('kind').notNull().default('system'),
    /** all | teachers | students | parents | staff. */
    audience: text('audience').notNull().default('all'),
    /** The announcement that produced this notification (set by the publish bridge). */
    announcementId: uuid('announcement_id').references(() => announcements.id, { onDelete: 'set null' }),
    /** unread | read. */
    status: text('status').notNull().default('unread'),
    readAt: timestamp('read_at', { withTimezone: true }),
    /** Redesign (P3): the resolved fan-out — how many people + a human target summary. */
    recipientCount: integer('recipient_count'),
    targetSummary: text('target_summary'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('notifications_institution_idx').on(t.institutionId),
    scopeIdx: index('notifications_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('notifications_status_idx').on(t.status),
    announcementIdx: index('notifications_announcement_idx').on(t.announcementId),
  }),
);

/**
 * Rich recipient targets attached to an announcement (admin-redesign Phase 3). Same `(kind, refId)`
 * target shape as recipient_group_members (see schema/recipients.ts). Replaces the single `audience`
 * enum for anything beyond the legacy broadcast; the RecipientResolver expands these to concrete
 * people. Reachable only through the announcement that owns them (cascade delete).
 */
export const announcementTargets = pgTable(
  'announcement_targets',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    /** The target kind (see schema/recipients.ts header). */
    kind: text('kind').notNull(),
    /** The anchor/entity id for the kind; null for broadcast kinds. */
    refId: uuid('ref_id'),
    ...timestamps,
  },
  (t) => ({
    instIdx: index('announcement_targets_institution_idx').on(t.institutionId),
    announcementIdx: index('announcement_targets_announcement_idx').on(t.announcementId),
  }),
);

export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type AnnouncementTarget = typeof announcementTargets.$inferSelect;
export type NewAnnouncementTarget = typeof announcementTargets.$inferInsert;
