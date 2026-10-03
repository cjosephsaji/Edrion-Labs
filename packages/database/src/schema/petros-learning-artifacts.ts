import { pgTable, uuid, integer, text, jsonb, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { primaryId } from './_helpers';
import { institutions } from './institutions';
import { students } from './people';
import { petrosSavedArtifacts, petrosArtifactReviewOutcomes } from './petros-artifacts';

export const petrosLearningArtifactReceipts = pgTable('petros_learning_artifact_receipts', {
  id: primaryId(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id),
  studentId: uuid('student_id').notNull().references(() => students.id),
  artifactId: uuid('artifact_id').notNull().references(() => petrosSavedArtifacts.id),
  revision: integer('revision').notNull(),
  commandId: uuid('command_id').notNull(),
  contentHash: text('content_hash').notNull(),
  receipt: jsonb('receipt').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ artifact: uniqueIndex('petros_learning_artifact_receipts_revision').on(t.artifactId, t.revision) }));

export const petrosLearningReviewReceipts = pgTable('petros_learning_review_receipts', {
  id: primaryId(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id),
  studentId: uuid('student_id').notNull().references(() => students.id),
  artifactReceiptId: uuid('artifact_receipt_id').notNull().references(() => petrosLearningArtifactReceipts.id),
  reviewOutcomeId: uuid('review_outcome_id').notNull().references(() => petrosArtifactReviewOutcomes.id),
  clientReviewId: uuid('client_review_id').notNull(),
  requestHash: text('request_hash').notNull(),
  receipt: jsonb('receipt').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ outcome: uniqueIndex('petros_learning_review_receipts_outcome').on(t.reviewOutcomeId),
  command: uniqueIndex('petros_learning_review_receipts_command').on(t.institutionId, t.studentId, t.clientReviewId) }));
