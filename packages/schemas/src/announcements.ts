import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/**
 * Institution-Portal ANNOUNCEMENTS + NOTIFICATIONS (Phase 9) request/response contracts. Tenancy
 * (institution_id) + the active campus scope (campus_id) are NEVER taken from the body — the API derives
 * them from the authenticated principal + scope header. Publishing an announcement fans out a
 * notification (the bridge); a notification may link back to its announcement.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish();
const shortText = (max = 200) => z.string().trim().max(max).nullish();
const longText = (max = 4000) => z.string().trim().max(max).nullish();

export const ANNOUNCEMENT_AUDIENCES = ['all', 'teachers', 'students', 'parents', 'staff'] as const;
export const announcementAudienceSchema = z.enum(ANNOUNCEMENT_AUDIENCES);
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const ANNOUNCEMENT_STATUSES = ['draft', 'published', 'archived'] as const;
export const announcementStatusSchema = z.enum(ANNOUNCEMENT_STATUSES);
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const NOTIFICATION_KINDS = ['system', 'announcement', 'alert'] as const;
export const notificationKindSchema = z.enum(NOTIFICATION_KINDS);
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_STATUSES = ['unread', 'read'] as const;
export const notificationStatusSchema = z.enum(NOTIFICATION_STATUSES);
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

const withVersion = { version: versionSchema };

// --- announcements -----------------------------------------------------------

export const announcementsListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: announcementStatusSchema.optional(),
});
export type AnnouncementsListQuery = z.infer<typeof announcementsListQuerySchema>;

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1, 'Required').max(200),
  body: longText(),
  referenceCode: z.string().trim().min(1, 'Required').max(80),
  audience: announcementAudienceSchema.default('all'),
  category: shortText(80),
  status: announcementStatusSchema.default('draft'),
  pinned: z.coerce.boolean().default(false),
  publishAt: isoDate,
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export const updateAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: longText(),
  referenceCode: z.string().trim().min(1).max(80).optional(),
  audience: announcementAudienceSchema.optional(),
  category: shortText(80),
  status: announcementStatusSchema.optional(),
  pinned: z.coerce.boolean().optional(),
  publishAt: isoDate,
  ...withVersion,
});
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;

/** Publish a draft announcement — the service stamps published_at + fans out a notification. */
export const publishAnnouncementSchema = z.object({
  audience: announcementAudienceSchema.optional(),
});
export type PublishAnnouncementInput = z.infer<typeof publishAnnouncementSchema>;

// --- notifications -----------------------------------------------------------

export const notificationsListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: notificationStatusSchema.optional(),
});
export type NotificationsListQuery = z.infer<typeof notificationsListQuerySchema>;

export const createNotificationSchema = z.object({
  title: z.string().trim().min(1, 'Required').max(200),
  body: longText(),
  kind: notificationKindSchema.default('system'),
  audience: announcementAudienceSchema.default('all'),
  announcementId: z.string().uuid().nullish(),
});
export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;

export const updateNotificationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: longText(),
  kind: notificationKindSchema.optional(),
  audience: announcementAudienceSchema.optional(),
  status: notificationStatusSchema.optional(),
  ...withVersion,
});
export type UpdateNotificationInput = z.infer<typeof updateNotificationSchema>;
