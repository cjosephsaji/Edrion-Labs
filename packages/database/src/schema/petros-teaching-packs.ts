import type {
  PetrosConceptPackCandidate,
  PetrosConceptPackReviewReceipt,
  PetrosReviewerAuthoritySnapshot,
  LearningProposal,
  M3Proposal,
  M3ReviewReceipt,
} from '@edrion/schemas';
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId } from './_helpers';
import { institutions } from './institutions';
import { courses } from './institutional-bridge';
import { knowledgeItems } from './student-knowledge';
import { staff } from './people';
import { institutionUsers } from './users';
import { petrosDocumentSourceRevisions } from './petros-document-learning';

/** Immutable, structurally/source-validated compiler output. It has no authority by itself. */
export const petrosTeachingPackCandidates = pgTable('petros_teaching_pack_candidates', {
  id: primaryId(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'restrict' }),
  sourceItemId: uuid('source_item_id').references(() => knowledgeItems.id, { onDelete: 'restrict' }),
  sourceFormat: text('source_format').notNull().default('v1'),
  sourceRevisionId: uuid('source_revision_id').references(() => petrosDocumentSourceRevisions.id, { onDelete: 'restrict' }),
  sourceVersion: text('source_version').notNull(),
  curriculumRevision: integer('curriculum_revision').notNull(),
  packId: uuid('pack_id').notNull(),
  packVersion: integer('pack_version').notNull(),
  compilerVersion: text('compiler_version').notNull(),
  schemaVersion: text('schema_version').notNull(),
  payloadHash: text('payload_hash').notNull(),
  payload: jsonb('payload').$type<PetrosConceptPackCandidate | LearningProposal | M3Proposal>().notNull(),
  commandId: uuid('command_id').notNull(),
  requestHash: text('request_hash').notNull(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => institutionUsers.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  courseTenant: foreignKey({ columns: [t.courseId, t.institutionId], foreignColumns: [courses.id, courses.institutionId] }),
  // A pack id is institution-wide so the student {packId, packVersion} reference is unambiguous.
  packVersionUq: uniqueIndex('petros_teaching_pack_candidate_version_uq').on(t.institutionId, t.packId, t.packVersion),
  commandUq: uniqueIndex('petros_teaching_pack_candidate_command_uq').on(t.institutionId, t.commandId),
  payloadUq: uniqueIndex('petros_teaching_pack_candidate_payload_uq').on(t.id, t.payloadHash),
  lookupIdx: index('petros_teaching_pack_candidate_lookup_idx').on(t.institutionId, t.packId, t.packVersion),
}));

/**
 * Append-only subject qualification evidence. This table is intentionally empty after migration;
 * roles, administrator status and teaching assignments never seed it or imply qualification.
 */
export const petrosReviewerQualifications = pgTable('petros_reviewer_qualifications', {
  rowId: uuid('row_id').primaryKey().defaultRandom(),
  id: uuid('qualification_id').notNull(),
  version: integer('qualification_version').notNull(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  reviewerUserId: uuid('reviewer_user_id').notNull().references(() => institutionUsers.id, { onDelete: 'restrict' }),
  reviewerStaffId: uuid('reviewer_staff_id').notNull().references(() => staff.id, { onDelete: 'restrict' }),
  subjectKey: text('subject_key').notNull(),
  status: text('status').notNull(),
  validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
  validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
  evidenceKind: text('evidence_kind').notNull(),
  evidenceHash: text('evidence_hash').notNull(),
  recordedByUserId: uuid('recorded_by_user_id').notNull().references(() => institutionUsers.id, { onDelete: 'restrict' }),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  versionUq: uniqueIndex('petros_reviewer_qualification_version_uq').on(t.id, t.version),
  currentIdx: index('petros_reviewer_qualification_current_idx').on(t.institutionId, t.reviewerUserId, t.subjectKey, t.id, t.version),
}));

/** Immutable explicit decisions. The latest non-revoked decision controls admission. */
export const petrosTeachingPackReviews = pgTable('petros_teaching_pack_reviews', {
  id: primaryId(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'restrict' }),
  candidateId: uuid('candidate_id').notNull().references(() => petrosTeachingPackCandidates.id, { onDelete: 'restrict' }),
  sourceItemId: uuid('source_item_id').references(() => knowledgeItems.id, { onDelete: 'restrict' }),
  sourceFormat: text('source_format').notNull().default('v1'),
  sourceRevisionId: uuid('source_revision_id').references(() => petrosDocumentSourceRevisions.id, { onDelete: 'restrict' }),
  sourceVersion: text('source_version').notNull(),
  reviewVersion: integer('review_version').notNull(),
  decision: text('decision').notNull(),
  payloadHash: text('payload_hash').notNull(),
  reviewerUserId: uuid('reviewer_user_id').notNull().references(() => institutionUsers.id, { onDelete: 'restrict' }),
  qualificationId: uuid('qualification_id').notNull(),
  qualificationVersion: integer('qualification_version').notNull(),
  authoritySnapshot: jsonb('authority_snapshot').$type<PetrosReviewerAuthoritySnapshot>().notNull(),
  receipt: jsonb('receipt').$type<PetrosConceptPackReviewReceipt | M3ReviewReceipt>().notNull(),
  commandId: uuid('command_id').notNull(),
  requestHash: text('request_hash').notNull(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  courseTenant: foreignKey({ columns: [t.courseId, t.institutionId], foreignColumns: [courses.id, courses.institutionId] }),
  qualificationVersion: foreignKey({
    columns: [t.qualificationId, t.qualificationVersion],
    foreignColumns: [petrosReviewerQualifications.id, petrosReviewerQualifications.version],
  }),
  versionUq: uniqueIndex('petros_teaching_pack_review_version_uq').on(t.candidateId, t.reviewVersion),
  commandUq: uniqueIndex('petros_teaching_pack_review_command_uq').on(t.institutionId, t.commandId),
  currentIdx: index('petros_teaching_pack_review_current_idx').on(t.institutionId, t.candidateId, t.reviewVersion),
}));

/** Revocation is an append-only event, never an update to the immutable review receipt. */
export const petrosTeachingPackReviewRevocations = pgTable('petros_teaching_pack_review_revocations', {
  id: primaryId(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  reviewId: uuid('review_id').notNull().references(() => petrosTeachingPackReviews.id, { onDelete: 'restrict' }),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'restrict' }),
  sourceItemId: uuid('source_item_id').notNull().references(() => knowledgeItems.id, { onDelete: 'restrict' }),
  commandId: uuid('command_id').notNull(),
  requestHash: text('request_hash').notNull(),
  reason: text('reason').notNull(),
  revokedByUserId: uuid('revoked_by_user_id').notNull().references(() => institutionUsers.id, { onDelete: 'restrict' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  reviewUq: uniqueIndex('petros_teaching_pack_review_revocation_uq').on(t.reviewId),
  commandUq: uniqueIndex('petros_teaching_pack_review_revocation_command_uq').on(t.institutionId, t.commandId),
}));
