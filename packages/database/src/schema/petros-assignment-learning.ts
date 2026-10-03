import type {
  PetrosAssignmentLearningReceipt,
  PetrosAssignmentLearningReleaseCandidate,
  PetrosAssignmentLearningStudentBinding,
} from '@edrion/schemas';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { assignments } from './assignments';
import { institutions } from './institutions';
import { students } from './people';
import { institutionUsers } from './users';

/** One immutable Petros learning release attached to the canonical assignment owner. */
export const petrosAssignmentLearningReleases = pgTable('petros_assignment_learning_releases', {
  id: uuid('id').primaryKey(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  assignmentId: uuid('assignment_id').notNull().references(() => assignments.id, { onDelete: 'restrict' }),
  assignmentVersion: integer('assignment_version').notNull(),
  authorityHash: text('authority_hash').notNull(),
  audienceHash: text('audience_hash').notNull(),
  candidate: jsonb('candidate').$type<PetrosAssignmentLearningReleaseCandidate>().notNull(),
  state: text('state').notNull().default('released'),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => institutionUsers.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  assignmentUq: uniqueIndex('petros_assignment_learning_release_assignment_uq').on(t.assignmentId),
  tenantCreatedIdx: index('petros_assignment_learning_release_tenant_created_idx').on(t.institutionId, t.createdAt),
}));

/** Target identity is separate from the assignment and from its immutable authority snapshots. */
export const petrosAssignmentLearningTargets = pgTable('petros_assignment_learning_targets', {
  id: uuid('id').primaryKey(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  releaseId: uuid('release_id').notNull().references(() => petrosAssignmentLearningReleases.id, { onDelete: 'restrict' }),
  kind: text('kind').notNull(),
  target: jsonb('target').$type<PetrosAssignmentLearningReleaseCandidate['target']>().notNull(),
  sourceSnapshot: jsonb('source_snapshot').$type<PetrosAssignmentLearningReleaseCandidate['sourceSnapshot']>().notNull(),
  objectiveSnapshot: jsonb('objective_snapshot').$type<PetrosAssignmentLearningReleaseCandidate['objectiveSnapshot']>().notNull(),
  packSnapshot: jsonb('pack_snapshot').$type<PetrosAssignmentLearningReleaseCandidate['packSnapshot']>().notNull(),
  curriculumSnapshot: jsonb('curriculum_snapshot').$type<PetrosAssignmentLearningReleaseCandidate['curriculumSnapshot']>().notNull(),
  rubricSnapshot: jsonb('rubric_snapshot').$type<PetrosAssignmentLearningReleaseCandidate['rubricSnapshot']>().notNull(),
  assistanceSnapshot: jsonb('assistance_snapshot').$type<PetrosAssignmentLearningReleaseCandidate['assistanceSnapshot']>().notNull(),
  resourceSnapshot: jsonb('resource_snapshot').$type<PetrosAssignmentLearningReleaseCandidate['resourceSnapshot']>().notNull(),
  evidenceSnapshot: jsonb('evidence_snapshot').$type<PetrosAssignmentLearningReleaseCandidate['evidenceSnapshot']>().notNull(),
  rolloutGates: jsonb('rollout_gates').$type<PetrosAssignmentLearningReleaseCandidate['rolloutGates']>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  releaseUq: uniqueIndex('petros_assignment_learning_target_release_uq').on(t.releaseId),
  tenantIdx: index('petros_assignment_learning_target_tenant_idx').on(t.institutionId, t.releaseId),
}));

export const petrosAssignmentLearningRecipients = pgTable('petros_assignment_learning_recipients', {
  id: uuid('id').primaryKey(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  releaseId: uuid('release_id').notNull().references(() => petrosAssignmentLearningReleases.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  sessionId: uuid('session_id').notNull(),
  eligibilitySnapshot: jsonb('eligibility_snapshot').$type<PetrosAssignmentLearningReleaseCandidate['audienceSnapshot']['recipients'][number]>().notNull(),
  binding: jsonb('binding').$type<PetrosAssignmentLearningStudentBinding>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  releaseStudentUq: uniqueIndex('petros_assignment_learning_recipient_uq').on(t.releaseId, t.studentId),
  studentIdx: index('petros_assignment_learning_recipient_student_idx').on(t.institutionId, t.studentId),
}));

/** Immutable idempotency receipt: same command + changed request is rejected. */
export const petrosAssignmentLearningReceipts = pgTable('petros_assignment_learning_receipts', {
  commandId: uuid('command_id').primaryKey(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  releaseId: uuid('release_id').notNull().references(() => petrosAssignmentLearningReleases.id, { onDelete: 'restrict' }),
  requestHash: text('request_hash').notNull(),
  response: jsonb('response').$type<PetrosAssignmentLearningReceipt>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ tenantCommandUq: uniqueIndex('petros_assignment_learning_receipt_tenant_command_uq').on(t.institutionId, t.commandId) }));

/** Identifier-only transactional notification for later delivery consumers. */
export const petrosAssignmentLearningOutbox = pgTable('petros_assignment_learning_outbox', {
  id: uuid('id').primaryKey(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  releaseId: uuid('release_id').notNull().references(() => petrosAssignmentLearningReleases.id, { onDelete: 'restrict' }),
  topic: text('topic').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pendingIdx: index('petros_assignment_learning_outbox_pending_idx').on(t.status, t.availableAt) }));
