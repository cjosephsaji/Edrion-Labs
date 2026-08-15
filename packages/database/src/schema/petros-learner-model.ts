import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { students } from './people';
import { petrosLearningSessions, petrosPlanningDecisions } from './petros-learning';

/** Immutable normalized evidence. Derived learner summaries can always be rebuilt from this table. */
export const petrosLearnerEvidenceEvents = pgTable(
  'petros_learner_evidence_events',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    sourceEventId: text('source_event_id').notNull(),
    sourceRecordId: text('source_record_id'),
    conceptId: text('concept_id').notNull(),
    topicId: text('topic_id').notNull(),
    prerequisiteConceptIds: text('prerequisite_concept_ids').array().notNull().default([]),
    evidenceKind: text('evidence_kind').notNull(),
    outcome: text('outcome').notNull(),
    creditBasisPoints: integer('credit_basis_points').notNull(),
    moveType: text('move_type'),
    profileDimension: text('profile_dimension'),
    preEvidenceBasisPoints: integer('pre_evidence_basis_points'),
    postEvidenceBasisPoints: integer('post_evidence_basis_points'),
    responseTimeMs: integer('response_time_ms'),
    hintCount: integer('hint_count').notNull().default(0),
    confidenceBefore: text('confidence_before'),
    confidenceAfter: text('confidence_after'),
    errorCategory: text('error_category').notNull().default('unclassified'),
    errorConfidenceBasisPoints: integer('error_confidence_basis_points').notNull().default(0),
    classificationStatus: text('classification_status').notNull().default('ready'),
    evaluatorVersion: text('evaluator_version'),
    algorithmVersion: text('algorithm_version').notNull(),
    schemaVersion: text('schema_version').notNull(),
    environment: text('environment').notNull().default('production'),
    synthetic: boolean('synthetic').notNull().default(false),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceEventUniq: uniqueIndex('petros_learner_evidence_source_event_uniq').on(
      t.institutionId,
      t.studentId,
      t.source,
      t.sourceEventId,
    ),
    ownerTimeIdx: index('petros_learner_evidence_owner_time_idx').on(
      t.institutionId,
      t.studentId,
      t.occurredAt,
    ),
    conceptTimeIdx: index('petros_learner_evidence_concept_time_idx').on(
      t.institutionId,
      t.studentId,
      t.conceptId,
      t.occurredAt,
    ),
    sourceIdx: index('petros_learner_evidence_source_idx').on(t.source, t.occurredAt),
    classifierIdx: index('petros_learner_evidence_classifier_idx').on(
      t.classificationStatus,
      t.ingestedAt,
    ),
  }),
);

/** Failed optional classifiers are isolated here and never participate in a derived model. */
export const petrosLearnerEvidenceQuarantine = pgTable(
  'petros_learner_evidence_quarantine',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    evidenceEventId: uuid('evidence_event_id').references(() => petrosLearnerEvidenceEvents.id, {
      onDelete: 'cascade',
    }),
    sourceEventId: text('source_event_id').notNull(),
    reasonCode: text('reason_code').notNull(),
    failureDetail: text('failure_detail').notNull(),
    status: text('status').notNull().default('pending'),
    retryCount: integer('retry_count').notNull().default(0),
    evaluatorVersion: text('evaluator_version'),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    ownerStatusIdx: index('petros_learner_quarantine_owner_status_idx').on(
      t.institutionId,
      t.studentId,
      t.status,
    ),
  }),
);

/** Mastery uses a documented 0..10,000 scale and retains recall/application separately. */
export const petrosLearnerConceptMastery = pgTable(
  'petros_learner_concept_mastery',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    conceptId: text('concept_id').notNull(),
    topicId: text('topic_id').notNull(),
    prerequisiteConceptIds: text('prerequisite_concept_ids').array().notNull().default([]),
    masteryBasisPoints: integer('mastery_basis_points').notNull(),
    recallBasisPoints: integer('recall_basis_points').notNull(),
    applicationBasisPoints: integer('application_basis_points').notNull(),
    confidenceBasisPoints: integer('confidence_basis_points').notNull(),
    uncertaintyBasisPoints: integer('uncertainty_basis_points').notNull(),
    evidenceCount: integer('evidence_count').notNull(),
    evidenceSources: jsonb('evidence_sources')
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    lastTouchedAt: timestamp('last_touched_at', { withTimezone: true }).notNull(),
    decayAnchorAt: timestamp('decay_anchor_at', { withTimezone: true }).notNull(),
    nextReviewAt: timestamp('next_review_at', { withTimezone: true }),
    lastUpdateEventId: uuid('last_update_event_id').references(
      () => petrosLearnerEvidenceEvents.id,
      { onDelete: 'set null' },
    ),
    algorithmVersion: text('algorithm_version').notNull(),
    rebuiltAt: timestamp('rebuilt_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    conceptVersionUniq: uniqueIndex('petros_learner_mastery_concept_version_uniq').on(
      t.institutionId,
      t.studentId,
      t.conceptId,
      t.algorithmVersion,
    ),
    topicIdx: index('petros_learner_mastery_topic_idx').on(t.institutionId, t.studentId, t.topicId),
    reviewIdx: index('petros_learner_mastery_review_idx').on(t.nextReviewAt),
  }),
);

export const petrosLearnerMoveOutcomes = pgTable(
  'petros_learner_move_outcomes',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    moveType: text('move_type').notNull(),
    topicId: text('topic_id').notNull().default('*'),
    profileDimension: text('profile_dimension').notNull().default('*'),
    successes: integer('successes').notNull(),
    failures: integer('failures').notNull(),
    skips: integer('skips').notNull(),
    sampleSize: integer('sample_size').notNull(),
    meanPreBasisPoints: integer('mean_pre_basis_points').notNull(),
    meanPostBasisPoints: integer('mean_post_basis_points').notNull(),
    meanResponseTimeMs: integer('mean_response_time_ms').notNull(),
    hintUses: integer('hint_uses').notNull(),
    confidenceChangeBasisPoints: integer('confidence_change_basis_points').notNull(),
    effectivenessBasisPoints: integer('effectiveness_basis_points').notNull(),
    confidenceBasisPoints: integer('confidence_basis_points').notNull(),
    uncertaintyBasisPoints: integer('uncertainty_basis_points').notNull(),
    recencyWeightBasisPoints: integer('recency_weight_basis_points').notNull(),
    lastEvidenceAt: timestamp('last_evidence_at', { withTimezone: true }).notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    rebuiltAt: timestamp('rebuilt_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dimensionVersionUniq: uniqueIndex('petros_learner_move_dimension_version_uniq').on(
      t.institutionId,
      t.studentId,
      t.moveType,
      t.topicId,
      t.profileDimension,
      t.algorithmVersion,
    ),
    ownerIdx: index('petros_learner_move_owner_idx').on(
      t.institutionId,
      t.studentId,
      t.lastEvidenceAt,
    ),
  }),
);

export const petrosLearnerPreferences = pgTable(
  'petros_learner_preferences',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    pace: text('pace').notNull(),
    depth: text('depth').notNull(),
    skipCount: integer('skip_count').notNull(),
    expandCount: integer('expand_count').notNull(),
    readCount: integer('read_count').notNull(),
    responseCount: integer('response_count').notNull(),
    meanResponseTimeMs: integer('mean_response_time_ms').notNull(),
    evidenceCount: integer('evidence_count').notNull(),
    confidenceBasisPoints: integer('confidence_basis_points').notNull(),
    minimumEvidenceMet: boolean('minimum_evidence_met').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    rebuiltAt: timestamp('rebuilt_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerVersionUniq: uniqueIndex('petros_learner_preferences_owner_version_uniq').on(
      t.institutionId,
      t.studentId,
      t.algorithmVersion,
    ),
  }),
);

export const petrosLearnerErrorFingerprints = pgTable(
  'petros_learner_error_fingerprints',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    topicId: text('topic_id').notNull().default('*'),
    count: integer('count').notNull(),
    contexts: text('contexts').array().notNull().default([]),
    confidenceBasisPoints: integer('confidence_basis_points').notNull(),
    evidenceEventIds: uuid('evidence_event_ids').array().notNull().default([]),
    lastEvidenceAt: timestamp('last_evidence_at', { withTimezone: true }).notNull(),
    evaluatorVersion: text('evaluator_version'),
    algorithmVersion: text('algorithm_version').notNull(),
    rebuiltAt: timestamp('rebuilt_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    categoryVersionUniq: uniqueIndex('petros_learner_error_category_version_uniq').on(
      t.institutionId,
      t.studentId,
      t.category,
      t.topicId,
      t.algorithmVersion,
    ),
  }),
);

export const petrosLearnerCalibration = pgTable(
  'petros_learner_calibration',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    buckets: jsonb('buckets')
      .$type<Array<{ confidence: string; outcome: string; count: number }>>()
      .notNull(),
    scoreBasisPoints: integer('score_basis_points').notNull(),
    uncertaintyBasisPoints: integer('uncertainty_basis_points').notNull(),
    evidenceCount: integer('evidence_count').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    rebuiltAt: timestamp('rebuilt_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerVersionUniq: uniqueIndex('petros_learner_calibration_owner_version_uniq').on(
      t.institutionId,
      t.studentId,
      t.algorithmVersion,
    ),
  }),
);

/** Exact bounded snapshot supplied to a PLAN decision, retained for causal reconciliation. */
export const petrosLearnerPlanSnapshots = pgTable(
  'petros_learner_plan_snapshots',
  {
    id: primaryId(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => petrosLearningSessions.id, { onDelete: 'cascade' }),
    decisionId: uuid('decision_id')
      .notNull()
      .references(() => petrosPlanningDecisions.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    topicId: text('topic_id').notNull(),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    causalFactors: text('causal_factors').array().notNull().default([]),
    algorithmVersion: text('algorithm_version').notNull(),
    schemaVersion: text('schema_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    decisionUniq: uniqueIndex('petros_learner_plan_snapshot_decision_uniq').on(t.decisionId),
    ownerIdx: index('petros_learner_plan_snapshot_owner_idx').on(
      t.institutionId,
      t.studentId,
      t.createdAt,
    ),
  }),
);

export const petrosLearnerModelJobs = pgTable(
  'petros_learner_model_jobs',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('rebuild'),
    status: text('status').notNull().default('queued'),
    algorithmVersion: text('algorithm_version').notNull(),
    batchSize: integer('batch_size').notNull().default(100),
    totalEvents: integer('total_events').notNull().default(0),
    processedEvents: integer('processed_events').notNull().default(0),
    failedEvents: integer('failed_events').notNull().default(0),
    retryCount: integer('retry_count').notNull().default(0),
    reason: text('reason').notNull(),
    requestedBy: text('requested_by').notNull(),
    cancellationRequested: boolean('cancellation_requested').notNull().default(false),
    beforeHash: text('before_hash'),
    afterHash: text('after_hash'),
    errorCode: text('error_code'),
    errorDetail: text('error_detail'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    ownerStatusIdx: index('petros_learner_jobs_owner_status_idx').on(
      t.institutionId,
      t.studentId,
      t.status,
      t.createdAt,
    ),
  }),
);

export type PetrosLearnerEvidenceEvent = typeof petrosLearnerEvidenceEvents.$inferSelect;
export type NewPetrosLearnerEvidenceEvent = typeof petrosLearnerEvidenceEvents.$inferInsert;
export type PetrosLearnerModelJob = typeof petrosLearnerModelJobs.$inferSelect;
