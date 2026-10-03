import { jsonb, pgTable, text, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core';
import type { PetrosProductionQualityReport, PetrosReleaseBundle, PetrosPilotEvent } from '@edrion/schemas';
import { primaryId } from './_helpers';
import { institutions } from './institutions';
import { students } from './people';

export const petrosReleaseEvaluations = pgTable('petros_release_evaluations', {
  id: uuid('id').primaryKey(), digest: text('digest').notNull(),
  report: jsonb('report').$type<PetrosProductionQualityReport>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const petrosReleaseBundles = pgTable('petros_release_bundles', {
  id: uuid('id').primaryKey(), digest: text('digest').notNull(),
  evaluationId: uuid('evaluation_id').notNull().references(() => petrosReleaseEvaluations.id),
  manifest: jsonb('manifest').$type<PetrosReleaseBundle>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
/** Disablement is an immutable receipt; re-import cannot silently re-enable a bundle. */
export const petrosReleaseDisables = pgTable('petros_release_disables', {
  id: uuid('id').primaryKey(), releaseId: uuid('release_id').notNull().references(() => petrosReleaseBundles.id),
  digest: text('digest').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ releaseUnique: uniqueIndex('petros_release_disable_uniq').on(t.releaseId) }));

/** Synthetic instrumentation only. Not a learner/evidence ledger. No text or arbitrary metadata. */
export const petrosPilotEvents = pgTable('petros_pilot_events', {
  id: primaryId(), institutionId: uuid('institution_id').notNull().references(() => institutions.id),
  studentId: uuid('student_id').notNull().references(() => students.id),
  eventId: uuid('event_id').notNull(), digest: text('digest').notNull(),
  experiment: text('experiment').notNull(), cohort: text('cohort').notNull(),
  event: jsonb('event').$type<PetrosPilotEvent>().notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ receiptUnique: uniqueIndex('petros_pilot_event_receipt_uniq').on(t.institutionId, t.studentId, t.eventId) }));
