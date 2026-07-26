import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { primaryId } from './_helpers';

/**
 * Tracked background-job runs (Phase 10e). Every execution of a scheduled maintenance job (the
 * former in-process sweeps) records a row here so the work is observable in System Health —
 * status, duration, items processed, and any error. Operational, not append-only.
 */
export const backgroundJobs = pgTable(
  'background_jobs',
  {
    id: primaryId(),
    /** Job name, e.g. `support-session.expiry`. */
    name: text('name').notNull(),
    queue: text('queue').notNull(),
    /** running | succeeded | failed */
    status: text('status').notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    /** How many records the run acted on (e.g. sessions expired). */
    itemsProcessed: integer('items_processed').notNull().default(0),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    error: text('error'),
  },
  (t) => ({
    nameStartedIdx: index('background_jobs_name_started_idx').on(t.name, t.startedAt),
    startedIdx: index('background_jobs_started_idx').on(t.startedAt),
  }),
);

export type BackgroundJob = typeof backgroundJobs.$inferSelect;
export type NewBackgroundJob = typeof backgroundJobs.$inferInsert;
