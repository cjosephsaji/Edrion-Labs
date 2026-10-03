import {
  boolean,
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
import type { PetrosArtifactContent, PetrosArtifactSource } from '@edrion/schemas';
import { primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { students } from './people';
import { petrosLearningSessions } from './petros-learning';

/** Reviewable AI output. Nothing in this table is student-owned or searchable. */
export const petrosArtifactBundles = pgTable(
  'petros_artifact_bundles',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').notNull().references(() => petrosLearningSessions.id, { onDelete: 'cascade' }),
    state: text('state').notNull().default('open'),
    version: integer('version').notNull().default(0),
    forwardLink: text('forward_link'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    discardedAt: timestamp('discarded_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    sessionUniq: uniqueIndex('petros_artifact_bundles_session_uniq').on(t.sessionId),
    ownerIdx: index('petros_artifact_bundles_owner_idx').on(t.institutionId, t.studentId, t.createdAt),
    stateIdx: index('petros_artifact_bundles_state_idx').on(t.state, t.updatedAt),
  }),
);

/** Common portable identity/provenance around the existing deck, note, and canvas products. */
export const petrosSavedArtifacts = pgTable(
  'petros_saved_artifacts',
  {
    id: primaryId(),
    portableId: uuid('portable_id').notNull(),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => petrosLearningSessions.id, { onDelete: 'set null' }),
    bundleId: uuid('bundle_id').references(() => petrosArtifactBundles.id, { onDelete: 'set null' }),
    sourceProposalId: uuid('source_proposal_id'),
    kind: text('kind').notNull(),
    lifecycle: text('lifecycle').notNull().default('saved'),
    content: jsonb('content').$type<PetrosArtifactContent>().notNull(),
    sources: jsonb('sources').$type<PetrosArtifactSource[]>().notNull().default([]),
    productType: text('product_type').notNull(),
    productTargetId: uuid('product_target_id').notNull(),
    contentVersion: text('content_version').notNull(),
    promptVersion: text('prompt_version').notNull(),
    schemaVersion: text('schema_version').notNull(),
    revision: integer('revision').notNull().default(1),
    dueAt: timestamp('due_at', { withTimezone: true }),
    intervalMinutes: integer('interval_minutes'),
    easeBasisPoints: integer('ease_basis_points'),
    reviewReps: integer('review_reps').notNull().default(0),
    reviewLapses: integer('review_lapses').notNull().default(0),
    schedulerVersion: text('scheduler_version'),
    examDate: date('exam_date'),
    examAware: boolean('exam_aware').notNull().default(false),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    portableUniq: uniqueIndex('petros_saved_artifacts_portable_uniq').on(t.portableId),
    proposalUniq: uniqueIndex('petros_saved_artifacts_proposal_uniq').on(t.sourceProposalId),
    productUniq: uniqueIndex('petros_saved_artifacts_product_uniq').on(t.productType, t.productTargetId),
    ownerIdx: index('petros_saved_artifacts_owner_idx').on(t.institutionId, t.studentId, t.createdAt),
    dueIdx: index('petros_saved_artifacts_due_idx').on(t.institutionId, t.studentId, t.dueAt),
  }),
);

export const petrosArtifactProposals = pgTable(
  'petros_artifact_proposals',
  {
    id: primaryId(),
    bundleId: uuid('bundle_id').notNull().references(() => petrosArtifactBundles.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    state: text('state').notNull().default('proposed'),
    selected: boolean('selected').notNull().default(false),
    originalContent: jsonb('original_content').$type<PetrosArtifactContent>().notNull(),
    content: jsonb('content').$type<PetrosArtifactContent>().notNull(),
    sources: jsonb('sources').$type<PetrosArtifactSource[]>().notNull().default([]),
    generationFunctionKey: text('generation_function_key').notNull(),
    promptVersion: text('prompt_version').notNull(),
    schemaVersion: text('schema_version').notNull(),
    version: integer('version').notNull().default(0),
    savedArtifactId: uuid('saved_artifact_id').references(() => petrosSavedArtifacts.id, { onDelete: 'set null' }),
    failureCode: text('failure_code'),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    savedAt: timestamp('saved_at', { withTimezone: true }),
    discardedAt: timestamp('discarded_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    bundleIdx: index('petros_artifact_proposals_bundle_idx').on(t.bundleId, t.createdAt),
    ownerStateIdx: index('petros_artifact_proposals_owner_state_idx').on(t.institutionId, t.studentId, t.state),
  }),
);

export const petrosArtifactRevisions = pgTable(
  'petros_artifact_revisions',
  {
    id: primaryId(),
    artifactId: uuid('artifact_id').notNull().references(() => petrosSavedArtifacts.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    content: jsonb('content').$type<PetrosArtifactContent>().notNull(),
    sources: jsonb('sources').$type<PetrosArtifactSource[]>().notNull().default([]),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    artifactRevisionUniq: uniqueIndex('petros_artifact_revisions_artifact_revision_uniq').on(t.artifactId, t.revision),
    ownerIdx: index('petros_artifact_revisions_owner_idx').on(t.institutionId, t.studentId, t.createdAt),
  }),
);

/** Idempotency result for a potentially partial, per-item commit. */
export const petrosArtifactCommitCommands = pgTable(
  'petros_artifact_commit_commands',
  {
    id: primaryId(),
    bundleId: uuid('bundle_id').notNull().references(() => petrosArtifactBundles.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    idempotencyKey: uuid('idempotency_key').notNull(),
    requestHash: text('request_hash'),
    status: text('status').notNull().default('in_progress'),
    response: jsonb('response').$type<Record<string, unknown> | null>(),
    errorCode: text('error_code'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    ownerKeyUniq: uniqueIndex('petros_artifact_commit_commands_owner_key_uniq').on(t.institutionId, t.studentId, t.idempotencyKey),
  }),
);

export const petrosArtifactReviewOutcomes = pgTable(
  'petros_artifact_review_outcomes',
  {
    id: primaryId(),
    artifactId: uuid('artifact_id').notNull().references(() => petrosSavedArtifacts.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    clientReviewId: uuid('client_review_id').notNull(),
    grade: text('grade').notNull(),
    confidence: text('confidence').notNull(),
    stateBefore: jsonb('state_before').$type<Record<string, unknown>>().notNull(),
    stateAfter: jsonb('state_after').$type<Record<string, unknown>>().notNull(),
    schedulerVersion: text('scheduler_version').notNull(),
    examAware: boolean('exam_aware').notNull().default(false),
    elapsedMs: integer('elapsed_ms'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull(),
    learnerEvidenceEventId: text('learner_evidence_event_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    clientUniq: uniqueIndex('petros_artifact_review_outcomes_client_uniq').on(t.institutionId, t.studentId, t.clientReviewId),
    artifactIdx: index('petros_artifact_review_outcomes_artifact_idx').on(t.artifactId, t.reviewedAt),
  }),
);

/** Content-free product telemetry and provenance lifecycle trail. */
export const petrosArtifactEvents = pgTable(
  'petros_artifact_events',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => petrosLearningSessions.id, { onDelete: 'set null' }),
    bundleId: uuid('bundle_id').references(() => petrosArtifactBundles.id, { onDelete: 'set null' }),
    proposalId: uuid('proposal_id').references(() => petrosArtifactProposals.id, { onDelete: 'set null' }),
    artifactId: uuid('artifact_id').references(() => petrosSavedArtifacts.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index('petros_artifact_events_owner_idx').on(t.institutionId, t.studentId, t.createdAt),
    typeIdx: index('petros_artifact_events_type_idx').on(t.type, t.createdAt),
  }),
);

export const petrosArtifactJobs = pgTable(
  'petros_artifact_jobs',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('queued'),
    options: jsonb('options').$type<Record<string, unknown>>().notNull().default({}),
    result: jsonb('result').$type<Record<string, unknown> | null>(),
    errorCode: text('error_code'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    ownerStatusIdx: index('petros_artifact_jobs_owner_status_idx').on(t.institutionId, t.studentId, t.status, t.createdAt),
  }),
);

export type PetrosArtifactBundleRow = typeof petrosArtifactBundles.$inferSelect;
export type PetrosArtifactProposalRow = typeof petrosArtifactProposals.$inferSelect;
export type PetrosSavedArtifactRow = typeof petrosSavedArtifacts.$inferSelect;
