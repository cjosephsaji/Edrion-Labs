import {
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { students } from './people';
import { independentUsers } from './users';
import { knowledgeItems } from './student-knowledge';

/** pgvector column — dimension fixed at migration time (text-embedding-3-small = 1536). */
export const vector1536 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]) {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string) {
    return value
      .slice(1, -1)
      .split(',')
      .map((n) => Number(n.trim()));
  },
});

const ownerCheck = (studentId: unknown, independentUserId: unknown) =>
  sql`num_nonnulls(${studentId}, ${independentUserId}) = 1`;

export type SubjectRef = {
  kind: 'erp_subject' | 'commitment' | 'self';
  id?: string;
  label?: string;
};

export type SourceRef = {
  knowledge_item_id: string;
  page: number;
};

export const reviewSessions = pgTable(
  'review_sessions',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'set null' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    cardsReviewed: integer('cards_reviewed').notNull().default(0),
    /** today | library | deck | reminder */
    source: text('source').notNull(),
    deckId: uuid('deck_id'),
  },
  (t) => ({
    ownerXor: check('review_sessions_owner_xor', ownerCheck(t.studentId, t.independentUserId)),
    studentIdx: index('review_sessions_student_idx').on(t.studentId, t.startedAt.desc()),
    indepIdx: index('review_sessions_indep_idx').on(t.independentUserId, t.startedAt.desc()),
  }),
);

export const userStreaks = pgTable(
  'user_streaks',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'set null' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    mode: text('mode').notNull().default('daily'),
    current: integer('current').notNull().default(0),
    best: integer('best').notNull().default(0),
    freezeTokens: integer('freeze_tokens').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerXor: check('user_streaks_owner_xor', ownerCheck(t.studentId, t.independentUserId)),
    studentUnique: uniqueIndex('user_streaks_student_unique').on(t.studentId).where(sql`${t.studentId} is not null`),
    indepUnique: uniqueIndex('user_streaks_indep_unique')
      .on(t.independentUserId)
      .where(sql`${t.independentUserId} is not null`),
  }),
);

/** Append-only streak credit log — one row per owner per study day. */
export const streakEvents = pgTable(
  'streak_events',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'set null' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    date: date('date').notNull(),
    creditedBy: text('credited_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerXor: check('streak_events_owner_xor', ownerCheck(t.studentId, t.independentUserId)),
    studentDateUq: uniqueIndex('streak_events_student_date_uq')
      .on(t.studentId, t.date)
      .where(sql`${t.studentId} is not null`),
    indepDateUq: uniqueIndex('streak_events_indep_date_uq')
      .on(t.independentUserId, t.date)
      .where(sql`${t.independentUserId} is not null`),
  }),
);

export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: primaryId(),
    knowledgeItemId: uuid('knowledge_item_id')
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'set null' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    page: integer('page').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    embedding: vector1536('embedding'),
  },
  (t) => ({
    ownerXor: check('knowledge_chunks_owner_xor', ownerCheck(t.studentId, t.independentUserId)),
    itemPageIdx: index('knowledge_chunks_item_page_idx').on(t.knowledgeItemId, t.page, t.chunkIndex),
    itemUq: uniqueIndex('knowledge_chunks_item_chunk_uq').on(t.knowledgeItemId, t.page, t.chunkIndex),
  }),
);

export const knowledgeItemChats = pgTable(
  'knowledge_item_chats',
  {
    id: primaryId(),
    knowledgeItemId: uuid('knowledge_item_id')
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'set null' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    citations: jsonb('citations').$type<Array<{ page: number; chunk_id: string }>>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerXor: check('knowledge_item_chats_owner_xor', ownerCheck(t.studentId, t.independentUserId)),
    itemIdx: index('knowledge_item_chats_item_idx').on(t.knowledgeItemId, t.createdAt),
  }),
);

export const generationJobs = pgTable(
  'generation_jobs',
  {
    id: primaryId(),
    knowledgeItemId: uuid('knowledge_item_id')
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'set null' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    kind: text('kind').notNull(),
    options: jsonb('options').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('pending'),
    proposals: jsonb('proposals').$type<unknown[]>().notNull().default([]),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => ({
    ownerXor: check('generation_jobs_owner_xor', ownerCheck(t.studentId, t.independentUserId)),
    itemIdx: index('generation_jobs_item_idx').on(t.knowledgeItemId, t.createdAt.desc()),
  }),
);

export const libraryNotes = pgTable(
  'library_notes',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'set null' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    title: text('title').notNull(),
    doc: jsonb('doc').$type<Record<string, unknown>>().notNull().default({}),
    subjectRef: jsonb('subject_ref').$type<SubjectRef | null>(),
    sourceRefs: jsonb('source_refs').$type<SourceRef[]>().notNull().default([]),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    ownerXor: check('library_notes_owner_xor', ownerCheck(t.studentId, t.independentUserId)),
    studentIdx: index('library_notes_student_idx').on(t.studentId, t.updatedAt.desc()),
    indepIdx: index('library_notes_indep_idx').on(t.independentUserId, t.updatedAt.desc()),
  }),
);

export const userReviewPrefs = pgTable(
  'user_review_prefs',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'set null' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    dailyReminderTime: text('daily_reminder_time'),
    newCardsPerDay: integer('new_cards_per_day').notNull().default(20),
    timezone: text('timezone').notNull().default('Asia/Kolkata'),
    version: integer('version').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    ownerXor: check('user_review_prefs_owner_xor', ownerCheck(t.studentId, t.independentUserId)),
    studentUnique: uniqueIndex('user_review_prefs_student_unique')
      .on(t.studentId)
      .where(sql`${t.studentId} is not null`),
    indepUnique: uniqueIndex('user_review_prefs_indep_unique')
      .on(t.independentUserId)
      .where(sql`${t.independentUserId} is not null`),
  }),
);

export type ReviewSession = typeof reviewSessions.$inferSelect;
export type UserStreak = typeof userStreaks.$inferSelect;
export type StreakEvent = typeof streakEvents.$inferSelect;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
export type GenerationJob = typeof generationJobs.$inferSelect;
export type LibraryNote = typeof libraryNotes.$inferSelect;
export type UserReviewPrefs = typeof userReviewPrefs.$inferSelect;
