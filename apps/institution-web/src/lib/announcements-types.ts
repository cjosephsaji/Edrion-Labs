/** Client-side mirrors of the portal Announcements + Notifications DTOs (Phase 9). The API is authoritative. */
import type { Paged } from './academics-types';

export type { Paged };

export type AnnouncementAudience = 'all' | 'teachers' | 'students' | 'parents' | 'staff';
export type AnnouncementStatus = 'draft' | 'published' | 'archived';
export type NotificationKind = 'system' | 'announcement' | 'alert';
export type NotificationStatus = 'unread' | 'read';

export interface AnnouncementRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  title: string;
  body: string | null;
  referenceCode: string;
  audience: AnnouncementAudience;
  category: string | null;
  status: AnnouncementStatus;
  pinned: boolean;
  publishAt: string | null;
  publishedAt: string | null;
}

export interface NotificationRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  title: string;
  body: string | null;
  kind: NotificationKind;
  audience: AnnouncementAudience;
  announcementId: string | null;
  status: NotificationStatus;
  readAt: string | null;
}
