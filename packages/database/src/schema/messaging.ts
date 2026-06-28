import { date, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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
