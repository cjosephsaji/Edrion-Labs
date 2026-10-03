import { pgTable, uuid, text, jsonb, timestamp, integer, doublePrecision, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import type { PetrosReturnPoint } from '@edrion/schemas';

export const petrosJourneys = pgTable('petros_journeys', {
  id: uuid('id').primaryKey().defaultRandom(), institutionId: uuid('institution_id').notNull(),
  studentId: uuid('student_id').notNull(), version: integer('version').notNull().default(1),
  returnPoint: jsonb('return_point').$type<PetrosReturnPoint>().notNull(),
  dismissedWatermark: text('dismissed_watermark'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const petrosJourneySessions = pgTable('petros_journey_sessions', {
  sessionId: uuid('session_id').primaryKey(), journeyId: uuid('journey_id').notNull(),
  institutionId: uuid('institution_id').notNull(), studentId: uuid('student_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const petrosMemoryRecords = pgTable('petros_memory_records', {
  id: uuid('id').primaryKey(), institutionId: uuid('institution_id').notNull(), studentId: uuid('student_id').notNull(),
  category: text('category').notNull(), sessionId: uuid('session_id').notNull(), sourceVersion: text('source_version').notNull(),
  sourceEventId: uuid('source_event_id').notNull(), supportingEvidenceIds: jsonb('supporting_evidence_ids').$type<string[]>().notNull(),
  content: text('content'), revision: integer('revision').notNull(), confidence: doublePrecision('confidence'),
  corrected: boolean('corrected').notNull().default(false), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
/** Content-free receipts fence retries; no erased text is copied to an immutable receipt. */
export const petrosContinuityReceipts = pgTable('petros_continuity_receipts', {
  id: uuid('id').primaryKey().defaultRandom(), institutionId: uuid('institution_id').notNull(), studentId: uuid('student_id').notNull(),
  commandId: uuid('command_id').notNull(), requestHash: text('request_hash').notNull(), kind: text('kind').notNull(),
  result: jsonb('result').$type<Record<string, unknown>>().notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ key: uniqueIndex('petros_continuity_receipt_key').on(t.institutionId, t.studentId, t.commandId) }));
