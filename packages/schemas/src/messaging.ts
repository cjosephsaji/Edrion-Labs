import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

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
