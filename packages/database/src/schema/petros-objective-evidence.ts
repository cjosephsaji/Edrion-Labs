import type {
  PetrosObjectiveEvidence,
  PetrosObjectiveEvidenceClassification,
  PetrosObjectiveEvidenceProjection,
  PetrosQualitativeReviewReceipt,
  PetrosQualitativeSubmissionReceipt,
} from '@edrion/schemas';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { institutions } from './institutions';
import { students } from './people';
import { petrosLearningSessions, petrosAnswerEvaluations } from './petros-learning';
import { petrosSavedArtifacts, petrosArtifactRevisions } from './petros-artifacts';
import { primaryId } from './_helpers';
import { sql } from 'drizzle-orm';

/** Immutable command receipt. request_hash turns UUID reuse with changed input into a conflict. */
export const petrosObjectiveEvidenceCommands = pgTable('petros_objective_evidence_commands', {
  id: primaryId(),
  commandId: uuid('command_id').notNull(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull().references(() => petrosLearningSessions.id, { onDelete: 'cascade' }),
  evaluationId: uuid('evaluation_id').references(() => petrosAnswerEvaluations.id, { onDelete: 'restrict' }),
  v2EvaluationId: uuid('v2_evaluation_id'),
  requestHash: text('request_hash').notNull(),
  eventId: uuid('event_id').notNull().unique(),
  response: jsonb('response').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ownerCommandUniq: uniqueIndex('petros_objective_evidence_commands_owner_command_uniq').on(t.institutionId, t.studentId, t.commandId),
  ownerCreatedIdx: index('petros_objective_evidence_commands_owner_created_idx').on(t.institutionId, t.studentId, t.createdAt),
}));

/** Append-only typed evidence. Content is hash-bound; raw learner answers stay with observations. */
export const petrosObjectiveEvidenceEvents = pgTable('petros_objective_evidence_events', {
  id: uuid('id').primaryKey(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull().references(() => petrosLearningSessions.id, { onDelete: 'cascade' }),
  commandId: uuid('command_id').notNull(),
  evaluationId: uuid('evaluation_id').references(() => petrosAnswerEvaluations.id, { onDelete: 'restrict' }),
  v2EvaluationId: uuid('v2_evaluation_id'),
  engineVersion: text('engine_version').notNull().default('v1'),
  objectiveId: uuid('objective_id').notNull(),
  objectiveVersion: integer('objective_version').notNull(),
  packId: uuid('pack_id').notNull(),
  packVersion: integer('pack_version').notNull(),
  correctsEventId: uuid('corrects_event_id'),
  correctionReason: text('correction_reason'),
  evidence: jsonb('evidence').$type<PetrosObjectiveEvidence>().notNull(),
  classification: jsonb('classification').$type<PetrosObjectiveEvidenceClassification>().notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ownerObjectiveIdx: index('petros_objective_evidence_events_owner_objective_idx').on(t.institutionId, t.studentId, t.objectiveId, t.objectiveVersion, t.occurredAt),
  sessionIdx: index('petros_objective_evidence_events_session_idx').on(t.sessionId, t.occurredAt),
  ownerCommandUniq: uniqueIndex('petros_objective_evidence_events_owner_command_uniq').on(t.institutionId, t.studentId, t.commandId),
  ownerEvaluationUniq: uniqueIndex('petros_objective_evidence_events_owner_evaluation_uniq').on(t.institutionId, t.studentId, t.evaluationId)
    .where(sql`${t.correctsEventId} is null`),
  correctedOnceUniq: uniqueIndex('petros_objective_evidence_events_corrected_once_uniq').on(t.correctsEventId),
}));

/** Transactional notification. Payload contains identifiers only, never answer or feedback text. */
export const petrosObjectiveEvidenceOutbox = pgTable('petros_objective_evidence_outbox', {
  id: uuid('id').primaryKey(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').notNull().unique(),
  topic: text('topic').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pendingIdx: index('petros_objective_evidence_outbox_pending_idx').on(t.status, t.availableAt) }));

/** Rebuildable, non-mastery projection. */
export const petrosObjectiveEvidenceProjections = pgTable('petros_objective_evidence_projections', {
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  objectiveId: uuid('objective_id').notNull(),
  objectiveVersion: integer('objective_version').notNull(),
  projection: jsonb('projection').$type<PetrosObjectiveEvidenceProjection>().notNull(),
  projectionHash: text('projection_hash').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ ownerObjectiveUniq: uniqueIndex('petros_objective_evidence_projections_owner_objective_uniq').on(t.institutionId, t.studentId, t.objectiveId, t.objectiveVersion) }));

/** Student explicitly shares one exact saved-artifact revision for educator review. */
export const petrosQualitativeSubmissions = pgTable('petros_qualitative_submissions', {
  id: uuid('id').primaryKey(),
  commandId: uuid('command_id').notNull(),
  requestHash: text('request_hash').notNull(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').notNull(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull().references(() => petrosLearningSessions.id, { onDelete: 'cascade' }),
  artifactId: uuid('artifact_id').notNull().references(() => petrosSavedArtifacts.id, { onDelete: 'restrict' }),
  revisionId: uuid('revision_id').notNull().references(() => petrosArtifactRevisions.id, { onDelete: 'restrict' }),
  revision: integer('revision').notNull(),
  objectiveId: uuid('objective_id').notNull(),
  objectiveVersion: integer('objective_version').notNull(),
  packId: uuid('pack_id').notNull(),
  packVersion: integer('pack_version').notNull(),
  submission: jsonb('submission').$type<PetrosQualitativeSubmissionReceipt>().notNull(),
  candidateHash: text('candidate_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ownerCommandUniq: uniqueIndex('petros_qualitative_submissions_owner_command_uniq').on(t.institutionId, t.studentId, t.commandId),
  ownerRevisionUniq: uniqueIndex('petros_qualitative_submissions_owner_revision_uniq').on(t.institutionId, t.studentId, t.revisionId),
  ownerCreatedIdx: index('petros_qualitative_submissions_owner_created_idx').on(t.institutionId, t.studentId, t.createdAt),
}));

/** Append-only qualified educator decision. It never writes numeric mastery. */
export const petrosQualitativeReviews = pgTable('petros_qualitative_reviews', {
  id: uuid('id').primaryKey(),
  commandId: uuid('command_id').notNull(),
  requestHash: text('request_hash').notNull(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').notNull(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  submissionId: uuid('submission_id').notNull().references(() => petrosQualitativeSubmissions.id, { onDelete: 'restrict' }),
  reviewerInstitutionUserId: uuid('reviewer_institution_user_id').notNull(),
  receipt: jsonb('receipt').$type<PetrosQualitativeReviewReceipt>().notNull(),
  receiptHash: text('receipt_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  institutionCommandUniq: uniqueIndex('petros_qualitative_reviews_institution_command_uniq').on(t.institutionId, t.commandId),
  submissionUniq: uniqueIndex('petros_qualitative_reviews_submission_uniq').on(t.submissionId),
  reviewerCreatedIdx: index('petros_qualitative_reviews_reviewer_created_idx').on(t.institutionId, t.reviewerInstitutionUserId, t.createdAt),
}));

export type PetrosObjectiveEvidenceEventRow = typeof petrosObjectiveEvidenceEvents.$inferSelect;
export type PetrosQualitativeSubmissionRow = typeof petrosQualitativeSubmissions.$inferSelect;

/** Explicit sharing, narrative feedback and revocation; no numeric evidence admission. */
export const petrosQualitativeEvents = pgTable('petros_qualitative_events',{
  id:uuid('id').primaryKey(),institutionId:uuid('institution_id').notNull(),studentId:uuid('student_id').notNull(),
  courseId:uuid('course_id').notNull(),artifactId:uuid('artifact_id').notNull(),revision:integer('revision').notNull(),
  kind:text('kind').notNull(),commandId:uuid('command_id').notNull(),requestHash:text('request_hash').notNull(),
  targetId:uuid('target_id').notNull(),payload:jsonb('payload').$type<Record<string,unknown>>().notNull(),
  createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),
},t=>({commandUniq:uniqueIndex('petros_qualitative_events_command_uq').on(t.institutionId,t.studentId,t.commandId),
  targetUniq:uniqueIndex('petros_qualitative_events_target_uq').on(t.institutionId,t.studentId,t.kind,t.targetId)}));
