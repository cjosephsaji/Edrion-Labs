import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { students } from './people';

/**
 * INSTITUTION-PORTAL counseling module (Phase 13 — Counselor). Campus-scoped, version-guarded.
 * Counseling notes are sensitive: writes are gated by sensitive permission keys AND reads are
 * audited (counseling.note.view) at the service layer — an explicit Phase-13 requirement.
 */
export const counselingRecords = pgTable(
  'counseling_records',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    /** individual | group | family | intake. */
    sessionType: text('session_type').notNull().default('individual'),
    title: text('title').notNull(),
    /** Sensitive free-text notes. */
    notes: text('notes'),
    sessionAt: timestamp('session_at', { withTimezone: true }),
    /** open | closed. */
    status: text('status').notNull().default('open'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('counseling_records_institution_idx').on(t.institutionId),
    scopeIdx: index('counseling_records_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('counseling_records_status_idx').on(t.status),
  }),
);

export const counselingCases = pgTable(
  'counseling_cases',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    summary: text('summary'),
    /** low | medium | high. */
    priority: text('priority').notNull().default('medium'),
    /** open | in_progress | closed. */
    status: text('status').notNull().default('open'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('counseling_cases_institution_idx').on(t.institutionId),
    scopeIdx: index('counseling_cases_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('counseling_cases_status_idx').on(t.status),
  }),
);

export type CounselingRecord = typeof counselingRecords.$inferSelect;
export type NewCounselingRecord = typeof counselingRecords.$inferInsert;
export type CounselingCase = typeof counselingCases.$inferSelect;
export type NewCounselingCase = typeof counselingCases.$inferInsert;
