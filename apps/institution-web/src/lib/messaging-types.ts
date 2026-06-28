/** Client-side mirrors of the portal Messaging DTOs (Phase 9). The API is authoritative. */
import type { Paged } from './academics-types';

export type { Paged };

export type MessageThreadStatus = 'open' | 'closed';
export type MessageSenderType = 'staff' | 'parent' | 'student' | 'system';

export interface MessageThreadRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  subject: string;
  referenceCode: string;
  category: string | null;
  status: MessageThreadStatus;
  postCount: number;
}

export interface MessagePostRow {
  id: string;
  institutionId: string;
  threadId: string;
  version: number;
  createdAt: string;
  body: string;
  authorName: string | null;
  senderType: MessageSenderType;
  postedDate: string | null;
}
