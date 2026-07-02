import { boolean, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';

/**
 * INSTITUTION-PORTAL messaging (Phase 9). A two-level model like exams (a campus-scoped, version-guarded
 * parent + child line rows reachable only through a parent the caller can see):
 *   - message_threads: a conversation/subject. `reference_code` is unique within the institution (a
 *     friendly 409 instead of a unique-index 500).
 *   - message_posts: the individual messages within a thread. No campus column of its own — it inherits
 *     the thread's campus and is only reachable through a thread the caller can see (mirrors
 *     exam_schedules / fee_payments). Both reads and writes are gated by the single `messages.use` key.
 *
 * Same tenant convention; references only institutions/campuses, so plain `.references()` is safe.
 */
export const messageThreads = pgTable(
  'message_threads',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    /** Unique within the institution — a human reference (friendly 409 on collision). */
    referenceCode: text('reference_code').notNull(),
    category: text('category'),
    /** open | closed. */
    status: text('status').notNull().default('open'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('message_threads_institution_idx').on(t.institutionId),
    scopeIdx: index('message_threads_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('message_threads_status_idx').on(t.status),
    codeUniq: uniqueIndex('message_thread_code_uniq').on(t.institutionId, t.referenceCode),
  }),
);

/** A message within a thread. Inherits the thread's campus (no campus column of its own). */
export const messagePosts = pgTable(
  'message_posts',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => messageThreads.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    /** Free-text author label (the portal has no per-recipient identity model yet). */
    authorName: text('author_name'),
    /** staff | parent | student | system. */
    senderType: text('sender_type').notNull().default('staff'),
    postedDate: date('posted_date'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('message_posts_institution_idx').on(t.institutionId),
    threadIdx: index('message_posts_thread_idx').on(t.threadId),
  }),
);

export type MessageThread = typeof messageThreads.$inferSelect;
export type NewMessageThread = typeof messageThreads.$inferInsert;
export type MessagePost = typeof messagePosts.$inferSelect;
export type NewMessagePost = typeof messagePosts.$inferInsert;

/**
 * INSTITUTION-PORTAL messaging v2 — a real chat model (admin-redesign Phase 4), replacing the
 * thread/post admin shape. A `conversation` is a direct (2-party) or group thread; participants are
 * people from the directory (student/teacher/staff/parent) or portal users, each with their own
 * read cursor (`last_read_at`) that drives unread counts and per-message read ticks. Messages carry
 * an optional reply and attachments. The creating portal user is always an `owner` participant, and
 * every read/write is confined to conversations the caller participates in.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    /** Group name (null for a direct conversation — the UI names it from the other participant). */
    title: text('title'),
    isGroup: boolean('is_group').notNull().default(false),
    /** Bumped on every new message so the conversation list can sort by recency cheaply. */
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('conversations_institution_idx').on(t.institutionId),
    scopeIdx: index('conversations_institution_campus_idx').on(t.institutionId, t.campusId),
    recentIdx: index('conversations_last_message_idx').on(t.institutionId, t.lastMessageAt),
  }),
);

/** A member of a conversation. `last_read_at` is the read cursor; `removed_at` soft-removes. */
export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    /** user | student | teacher | staff | parent — which directory/identity table `participant_id` points at. */
    participantType: text('participant_type').notNull(),
    participantId: uuid('participant_id').notNull(),
    /** owner | member. */
    role: text('role').notNull().default('member'),
    muted: boolean('muted').notNull().default(false),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    addedBy: uuid('added_by'),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    instIdx: index('conversation_participants_institution_idx').on(t.institutionId),
    convIdx: index('conversation_participants_conversation_idx').on(t.conversationId),
    whoIdx: index('conversation_participants_who_idx').on(t.participantType, t.participantId),
    uniq: uniqueIndex('conversation_participant_uniq').on(t.conversationId, t.participantType, t.participantId),
  }),
);

/** A message within a conversation. Inherits the conversation's scope (reachable only through it). */
export const messages = pgTable(
  'messages',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    /** The sender participant identity (same shape as conversation_participants). */
    senderType: text('sender_type').notNull(),
    senderId: uuid('sender_id').notNull(),
    body: text('body').notNull(),
    /** Optional in-thread reply target. */
    replyToId: uuid('reply_to_id'),
    ...timestamps,
  },
  (t) => ({
    instIdx: index('messages_institution_idx').on(t.institutionId),
    convIdx: index('messages_conversation_idx').on(t.conversationId, t.createdAt),
  }),
);

/**
 * An attachment on a message. Metadata only for now — `storage_key` stays null until a blob store is
 * wired (the API exposes an integration-ready upload endpoint that reports "storage not configured"
 * rather than faking an upload). No campus column of its own; reachable only through its message.
 */
export const messageAttachments = pgTable(
  'message_attachments',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    contentType: text('content_type'),
    sizeBytes: integer('size_bytes'),
    /** Object-store key once uploads are wired; null = pending/not configured. */
    storageKey: text('storage_key'),
    ...timestamps,
  },
  (t) => ({
    instIdx: index('message_attachments_institution_idx').on(t.institutionId),
    msgIdx: index('message_attachments_message_idx').on(t.messageId),
  }),
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type NewConversationParticipant = typeof conversationParticipants.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type MessageAttachment = typeof messageAttachments.$inferSelect;
export type NewMessageAttachment = typeof messageAttachments.$inferInsert;
