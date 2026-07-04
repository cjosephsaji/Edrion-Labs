import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';

/**
 * Petros (the platform AI assistant) — conversation, message, artifact, attachment and paused-turn
 * persistence (Phase 1). Tenant-scoped (RLS via zzz_rls.sql); conversations are PRIVATE to their
 * owning institution user. Mutations still flow through portal_ai_runs — a chat turn that hits a
 * state-changing tool creates a run exactly like the classic copilot path; the message stores the
 * run id and renders the confirmation card. THE invariant is unchanged: no state-changing action
 * without a human confirmation.
 */

/** A private chat thread between one institution user and Petros. */
export const petrosConversations = pgTable(
  'petros_conversations',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    /** Owner. Conversations are private — every read is filtered by this. */
    institutionUserId: uuid('institution_user_id').notNull(),
    /** Nano-generated after the first exchange; editable by the owner. */
    title: text('title'),
    status: text('status').notNull().default('active'), // active | archived
    pinned: boolean('pinned').notNull().default(false),
    /** Rolling nano summary of older turns dropped from the model input window. */
    summary: text('summary'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    ownerIdx: index('petros_conversations_owner_idx').on(
      t.institutionId,
      t.institutionUserId,
      t.lastMessageAt,
    ),
    instIdx: index('petros_conversations_institution_idx').on(t.institutionId),
  }),
);

/**
 * One message in a conversation. `content` is a typed block array:
 *   text | tool_activity{toolName,status,summary} | artifact_ref{artifactId} |
 *   question{options,answeredOptionId?} | confirmation_ref{runId} | attachment_ref{attachmentId}
 * NEVER raw model reasoning.
 */
export const petrosMessages = pgTable(
  'petros_messages',
  {
    id: primaryId(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => petrosConversations.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // user | assistant
    content: jsonb('content').$type<Record<string, unknown>[]>().notNull().default([]),
    status: text('status').notNull().default('complete'), // streaming | complete | error | awaiting_input | awaiting_confirmation
    /** Set when this assistant turn raised a mutation → links to portal_ai_runs. */
    runId: uuid('run_id'),
    model: text('model'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cachedInputTokens: integer('cached_input_tokens'),
    stopReason: text('stop_reason'),
    ...timestamps,
  },
  (t) => ({
    convIdx: index('petros_messages_conversation_idx').on(t.conversationId, t.createdAt),
    instIdx: index('petros_messages_institution_idx').on(t.institutionId),
  }),
);

/** A generated asset attached to a message (PDF, chart SVG, report table, extracted text). */
export const petrosArtifacts = pgTable(
  'petros_artifacts',
  {
    id: primaryId(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => petrosConversations.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => petrosMessages.id, { onDelete: 'set null' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // document_pdf | chart_svg | report_table | image | extracted_text
    title: text('title').notNull(),
    docType: text('doc_type'),
    storagePath: text('storage_path'),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    /** Inline payload for small artifacts (sanitized SVG markup, report table JSON). */
    meta: jsonb('meta').$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => ({
    convIdx: index('petros_artifacts_conversation_idx').on(t.conversationId),
    instIdx: index('petros_artifacts_institution_idx').on(t.institutionId),
  }),
);

/** A user-uploaded file attached to a conversation. */
export const petrosAttachments = pgTable(
  'petros_attachments',
  {
    id: primaryId(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => petrosConversations.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    institutionUserId: uuid('institution_user_id').notNull(),
    filename: text('filename').notNull(),
    storagePath: text('storage_path').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    parseStatus: text('parse_status').notNull().default('pending'), // pending | parsed | failed
    /** OpenAI Files API id when the PDF was uploaded provider-side. */
    openaiFileId: text('openai_file_id'),
    /** Extracted text for docx (and OCR fallbacks). */
    extractedText: text('extracted_text'),
    ...timestamps,
  },
  (t) => ({
    convIdx: index('petros_attachments_conversation_idx').on(t.conversationId),
    instIdx: index('petros_attachments_institution_idx').on(t.institutionId),
  }),
);

/**
 * Paused agent-loop state: the serialized OpenAI `input` array through the pending function call
 * (already passed through redactSecrets). One active per conversation. Resumed by an answer /
 * confirm / reject; expired rows resolve to a synthetic "not confirmed; cancelled" result.
 */
export const petrosPendingTurns = pgTable(
  'petros_pending_turns',
  {
    id: primaryId(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => petrosConversations.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // confirmation | question
    runId: uuid('run_id'),
    messageId: uuid('message_id')
      .notNull()
      .references(() => petrosMessages.id, { onDelete: 'cascade' }),
    apiInput: jsonb('api_input').$type<unknown[]>().notNull().default([]),
    pendingCallId: text('pending_call_id').notNull(),
    /** For kind=question: the offered options. */
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}),
    status: text('status').notNull().default('pending'), // pending | resolved | expired
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => ({
    convIdx: index('petros_pending_turns_conversation_idx').on(t.conversationId),
    instIdx: index('petros_pending_turns_institution_idx').on(t.institutionId),
    oneActive: uniqueIndex('petros_pending_turns_one_active')
      .on(t.conversationId)
      .where(sql`status = 'pending'`),
  }),
);

/** Daily off-topic decline counters (admins see aggregates only, never prompts). */
export const petrosDeclineStats = pgTable(
  'petros_decline_stats',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    day: date('day').notNull(),
    count: integer('count').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    uniq: uniqueIndex('petros_decline_stats_uniq').on(t.institutionId, t.category, t.day),
  }),
);

export type PetrosDeclineStat = typeof petrosDeclineStats.$inferSelect;

export type PetrosConversation = typeof petrosConversations.$inferSelect;
export type NewPetrosConversation = typeof petrosConversations.$inferInsert;
export type PetrosMessage = typeof petrosMessages.$inferSelect;
export type NewPetrosMessage = typeof petrosMessages.$inferInsert;
export type PetrosArtifact = typeof petrosArtifacts.$inferSelect;
export type NewPetrosArtifact = typeof petrosArtifacts.$inferInsert;
export type PetrosAttachment = typeof petrosAttachments.$inferSelect;
export type NewPetrosAttachment = typeof petrosAttachments.$inferInsert;
export type PetrosPendingTurn = typeof petrosPendingTurns.$inferSelect;
export type NewPetrosPendingTurn = typeof petrosPendingTurns.$inferInsert;
