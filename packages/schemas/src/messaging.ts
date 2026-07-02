import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';
import { targetsSchema } from './recipients';

/**
 * Institution-Portal MESSAGING (Phase 9) request/response contracts: threads + the posts within a
 * thread. Tenancy (institution_id) + the active campus scope (campus_id) are NEVER taken from the body.
 * Both reads and writes are gated by the single `messages.use` key.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish();
const shortText = (max = 160) => z.string().trim().max(max).nullish();

export const MESSAGE_THREAD_STATUSES = ['open', 'closed'] as const;
export const messageThreadStatusSchema = z.enum(MESSAGE_THREAD_STATUSES);
export type MessageThreadStatus = (typeof MESSAGE_THREAD_STATUSES)[number];

export const MESSAGE_SENDER_TYPES = ['staff', 'parent', 'student', 'system'] as const;
export const messageSenderTypeSchema = z.enum(MESSAGE_SENDER_TYPES);
export type MessageSenderType = (typeof MESSAGE_SENDER_TYPES)[number];

const withVersion = { version: versionSchema };

// --- threads -----------------------------------------------------------------

export const messageThreadsListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: messageThreadStatusSchema.optional(),
});
export type MessageThreadsListQuery = z.infer<typeof messageThreadsListQuerySchema>;

export const createMessageThreadSchema = z.object({
  subject: z.string().trim().min(1, 'Required').max(200),
  referenceCode: z.string().trim().min(1, 'Required').max(80),
  category: shortText(80),
  status: messageThreadStatusSchema.default('open'),
});
export type CreateMessageThreadInput = z.infer<typeof createMessageThreadSchema>;

export const updateMessageThreadSchema = z.object({
  subject: z.string().trim().min(1).max(200).optional(),
  referenceCode: z.string().trim().min(1).max(80).optional(),
  category: shortText(80),
  status: messageThreadStatusSchema.optional(),
  ...withVersion,
});
export type UpdateMessageThreadInput = z.infer<typeof updateMessageThreadSchema>;

// --- posts (within a thread) -------------------------------------------------

export const createMessagePostSchema = z.object({
  body: z.string().trim().min(1, 'Required').max(4000),
  authorName: shortText(120),
  senderType: messageSenderTypeSchema.default('staff'),
  postedDate: isoDate,
});
export type CreateMessagePostInput = z.infer<typeof createMessagePostSchema>;

export const updateMessagePostSchema = z.object({
  body: z.string().trim().min(1).max(4000).optional(),
  authorName: shortText(120),
  senderType: messageSenderTypeSchema.optional(),
  postedDate: isoDate,
  ...withVersion,
});
export type UpdateMessagePostInput = z.infer<typeof updateMessagePostSchema>;

// =============================================================================
// Messaging v2 — conversations (admin-redesign Phase 4)
// =============================================================================

export const CONVERSATION_FILTERS = ['all', 'unread', 'archived'] as const;
export const conversationFilterSchema = z.enum(CONVERSATION_FILTERS);
export type ConversationFilter = (typeof CONVERSATION_FILTERS)[number];

export const conversationsListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(160).optional(),
  filter: conversationFilterSchema.default('all'),
});
export type ConversationsListQuery = z.infer<typeof conversationsListQuerySchema>;

/** One attachment's metadata (upload wiring lands later; body carries metadata only for now). */
export const messageAttachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().max(160).nullish(),
  sizeBytes: z.number().int().min(0).max(2_147_483_647).nullish(),
});
export type MessageAttachmentInput = z.infer<typeof messageAttachmentSchema>;

/**
 * Start a conversation. Participants are chosen with the recipient targeting model (`targets`) — an
 * individual for a direct chat, or any mix/derived group for a group chat. The creator is added as
 * owner automatically. An optional first message can be sent in the same request.
 */
export const createConversationSchema = z.object({
  title: z.string().trim().max(200).nullish(),
  isGroup: z.boolean().optional(),
  targets: targetsSchema,
  body: z.string().trim().max(8000).nullish(),
});
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const postMessageSchema = z.object({
  body: z.string().trim().min(1, 'Required').max(8000),
  replyToId: z.string().uuid().nullish(),
  attachments: z.array(messageAttachmentSchema).max(20).optional(),
});
export type PostMessageInput = z.infer<typeof postMessageSchema>;

/**
 * A conversation's messages are loaded in a single batch client-side (no in-thread paging yet), so
 * this allows a much larger page than the shared 100-cap `paginationQuerySchema` — the message view
 * requests pageSize=200. Kept as its own schema so raising the ceiling doesn't loosen every list.
 */
export const messagesListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});
export type MessagesListQuery = z.infer<typeof messagesListQuerySchema>;

export const addParticipantsSchema = z.object({ targets: targetsSchema });
export type AddParticipantsInput = z.infer<typeof addParticipantsSchema>;

export const updateConversationSchema = z.object({
  title: z.string().trim().max(200).nullish(),
  muted: z.boolean().optional(),
  archived: z.boolean().optional(),
  closed: z.boolean().optional(),
});
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
