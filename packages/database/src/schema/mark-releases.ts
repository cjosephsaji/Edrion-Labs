import { index, integer, jsonb, pgTable, text, timestamp, uuid, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';

/**
 * Mark release batches — authoritative released entry set for student Results + report cards.
 * grade_entries.published remains the row-level gate; entry_ids is the batch snapshot.
 */
export const markReleaseBatches = pgTable(
  'mark_release_batches',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),
    termId: uuid('term_id'),
    scope: jsonb('scope').$type<Record<string, unknown>>().notNull().default({}),
    scopeHash: text('scope_hash'),
    entryIds: uuid('entry_ids').array().notNull().default([]),
    status: text('status').notNull().default('released'),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    retractedAt: timestamp('retracted_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
    version: integer('version').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    institutionIdx: index('mark_release_batches_institution_idx').on(t.institutionId),
    termIdx: index('mark_release_batches_term_idx').on(t.termId),
    statusCk: check(
      'mark_release_batches_status_ck',
      sql`${t.status} IN ('draft','releasing','released','retracted')`,
    ),
  }),
);

export type MarkReleaseBatch = typeof markReleaseBatches.$inferSelect;
