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
import type {
  PetrosGapAlarmContent,
  PetrosReflectionRankingReason,
  PetrosSessionRecapContent,
} from '@edrion/schemas';
import { primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { students } from './people';
import { petrosLearningSessions } from './petros-learning';

/** One immutable derivation head. Child rows can be replaced because source evidence remains durable. */
export const petrosReflectionSnapshots = pgTable(
  'petros_reflection_snapshots',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    schemaVersion: text('schema_version').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    sourceHash: text('source_hash').notNull(),
    sourceThroughAt: timestamp('source_through_at', { withTimezone: true }),
    graphUpdatedAt: timestamp('graph_updated_at', { withTimezone: true }),
    status: text('status').notNull().default('completed'),
    idempotencyKey: uuid('idempotency_key').notNull(),
    mapStateCount: integer('map_state_count').notNull().default(0),
    recommendationCount: integer('recommendation_count').notNull().default(0),
    recapCount: integer('recap_count').notNull().default(0),
    alarmCount: integer('alarm_count').notNull().default(0),
    missingSyllabusLinks: integer('missing_syllabus_links').notNull().default(0),
    validationFailureCount: integer('validation_failure_count').notNull().default(0),
    fallbackCount: integer('fallback_count').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => ({
    ownerVersionHashUniq: uniqueIndex('petros_reflection_snapshots_owner_version_hash_uniq').on(
      t.institutionId,
      t.studentId,
      t.algorithmVersion,
      t.sourceHash,
    ),
    ownerKeyUniq: uniqueIndex('petros_reflection_snapshots_owner_key_uniq').on(
      t.institutionId,
      t.studentId,
      t.idempotencyKey,
    ),
    statusIdx: index('petros_reflection_snapshots_status_idx').on(t.status, t.createdAt),
  }),
);

export const petrosReflectionMapStates = pgTable(
  'petros_reflection_map_states',
  {
    id: primaryId(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => petrosReflectionSnapshots.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').notNull(),
    studentId: uuid('student_id').notNull(),
    conceptId: text('concept_id').notNull(),
    topicId: text('topic_id').notNull(),
    title: text('title').notNull(),
    subjectLabel: text('subject_label').notNull(),
    curriculumLabel: text('curriculum_label').notNull(),
    state: text('state').notNull(),
    stateExplanation: text('state_explanation').notNull(),
    evidenceCount: integer('evidence_count').notNull(),
    masteryBasisPoints: integer('mastery_basis_points'),
    uncertaintyBasisPoints: integer('uncertainty_basis_points').notNull(),
    freshness: text('freshness').notNull(),
    evidenceAgeDays: integer('evidence_age_days'),
    lastEvidenceAt: timestamp('last_evidence_at', { withTimezone: true }),
    prerequisiteConceptIds: text('prerequisite_concept_ids').array().notNull().default([]),
    dependentConceptIds: text('dependent_concept_ids').array().notNull().default([]),
    examRelevance: jsonb('exam_relevance').$type<Record<string, unknown>>().notNull().default({}),
    recommendationId: uuid('recommendation_id'),
    algorithmVersion: text('algorithm_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    snapshotConceptUniq: uniqueIndex('petros_reflection_map_snapshot_concept_uniq').on(
      t.snapshotId,
      t.conceptId,
    ),
    ownerStateIdx: index('petros_reflection_map_owner_state_idx').on(
      t.institutionId,
      t.studentId,
      t.state,
    ),
  }),
);

export const petrosReflectionRecommendations = pgTable(
  'petros_reflection_recommendations',
  {
    id: primaryId(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => petrosReflectionSnapshots.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').notNull(),
    studentId: uuid('student_id').notNull(),
    conceptId: text('concept_id').notNull(),
    topicId: text('topic_id').notNull(),
    title: text('title').notNull(),
    actionLabel: text('action_label').notNull(),
    sessionType: text('session_type').notNull(),
    score: integer('score').notNull(),
    reasons: jsonb('reasons').$type<PetrosReflectionRankingReason[]>().notNull(),
    whyThis: text('why_this').notNull(),
    evidenceAgeDays: integer('evidence_age_days'),
    sourceFingerprint: text('source_fingerprint').notNull(),
    status: text('status').notNull().default('active'),
    startedIntentId: uuid('started_intent_id'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    algorithmVersion: text('algorithm_version').notNull(),
    ...timestamps,
  },
  (t) => ({
    snapshotConceptUniq: uniqueIndex('petros_reflection_recommendation_snapshot_concept_uniq').on(
      t.snapshotId,
      t.conceptId,
    ),
    ownerStatusIdx: index('petros_reflection_recommendation_owner_status_idx').on(
      t.institutionId,
      t.studentId,
      t.status,
    ),
  }),
);

export const petrosReflectionCalibrationInsights = pgTable(
  'petros_reflection_calibration_insights',
  {
    id: primaryId(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => petrosReflectionSnapshots.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').notNull(),
    studentId: uuid('student_id').notNull(),
    eligible: boolean('eligible').notNull(),
    evidenceCount: integer('evidence_count').notNull(),
    direction: text('direction').notNull(),
    trend: text('trend').notNull(),
    meanConfidenceBasisPoints: integer('mean_confidence_basis_points'),
    meanOutcomeBasisPoints: integer('mean_outcome_basis_points'),
    gapBasisPoints: integer('gap_basis_points'),
    uncertaintyBasisPoints: integer('uncertainty_basis_points').notNull(),
    headline: text('headline').notNull(),
    explanation: text('explanation').notNull(),
    actionRecommendationId: uuid('action_recommendation_id'),
    status: text('status').notNull().default('hidden'),
    quietUntil: timestamp('quiet_until', { withTimezone: true }),
    algorithmVersion: text('algorithm_version').notNull(),
    ...timestamps,
  },
  (t) => ({
    snapshotUniq: uniqueIndex('petros_reflection_calibration_snapshot_uniq').on(t.snapshotId),
    ownerStatusIdx: index('petros_reflection_calibration_owner_status_idx').on(
      t.institutionId,
      t.studentId,
      t.status,
    ),
  }),
);

export const petrosReflectionSessionRecaps = pgTable(
  'petros_reflection_session_recaps',
  {
    id: primaryId(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => petrosReflectionSnapshots.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => petrosLearningSessions.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').notNull(),
    studentId: uuid('student_id').notNull(),
    topic: text('topic').notNull(),
    content: jsonb('content').$type<PetrosSessionRecapContent>().notNull(),
    status: text('status').notNull().default('active'),
    correctedText: text('corrected_text'),
    generationSource: text('generation_source').notNull(),
    functionKey: text('function_key').notNull(),
    requestId: text('request_id'),
    routeReference: jsonb('route_reference').$type<Record<string, unknown> | null>(),
    validationPassed: boolean('validation_passed').notNull().default(true),
    closedAt: timestamp('closed_at', { withTimezone: true }).notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    ...timestamps,
  },
  (t) => ({
    sessionVersionUniq: uniqueIndex('petros_reflection_recap_session_version_uniq').on(
      t.sessionId,
      t.algorithmVersion,
    ),
    ownerClosedIdx: index('petros_reflection_recap_owner_closed_idx').on(
      t.institutionId,
      t.studentId,
      t.closedAt,
    ),
  }),
);

export const petrosReflectionGapAlarms = pgTable(
  'petros_reflection_gap_alarms',
  {
    id: primaryId(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => petrosReflectionSnapshots.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').notNull(),
    studentId: uuid('student_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    content: jsonb('content').$type<PetrosGapAlarmContent>().notNull(),
    recommendationId: uuid('recommendation_id'),
    status: text('status').notNull().default('active'),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    resolutionReason: text('resolution_reason'),
    falsePositive: boolean('false_positive').notNull().default(false),
    generationSource: text('generation_source').notNull(),
    functionKey: text('function_key').notNull(),
    requestId: text('request_id'),
    routeReference: jsonb('route_reference').$type<Record<string, unknown> | null>(),
    validationPassed: boolean('validation_passed').notNull().default(true),
    algorithmVersion: text('algorithm_version').notNull(),
    ...timestamps,
  },
  (t) => ({
    ownerFingerprintVersionUniq: uniqueIndex('petros_reflection_alarm_owner_fingerprint_uniq').on(
      t.institutionId,
      t.studentId,
      t.fingerprint,
      t.algorithmVersion,
    ),
    ownerStatusIdx: index('petros_reflection_alarm_owner_status_idx').on(
      t.institutionId,
      t.studentId,
      t.status,
    ),
  }),
);

export const petrosReflectionEvidenceLinks = pgTable(
  'petros_reflection_evidence_links',
  {
    id: primaryId(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => petrosReflectionSnapshots.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').notNull(),
    studentId: uuid('student_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    label: text('label').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entitySourceUniq: uniqueIndex('petros_reflection_evidence_entity_source_uniq').on(
      t.entityType,
      t.entityId,
      t.sourceType,
      t.sourceId,
    ),
    ownerEntityIdx: index('petros_reflection_evidence_owner_entity_idx').on(
      t.institutionId,
      t.studentId,
      t.entityType,
      t.entityId,
    ),
  }),
);

/** Content-free lifecycle, rebuild, function, cost, and false-positive telemetry. */
export const petrosReflectionEvents = pgTable(
  'petros_reflection_events',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull(),
    studentId: uuid('student_id').notNull(),
    snapshotId: uuid('snapshot_id').references(() => petrosReflectionSnapshots.id, {
      onDelete: 'set null',
    }),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    type: text('type').notNull(),
    functionKey: text('function_key'),
    providerKey: text('provider_key'),
    modelKey: text('model_key'),
    algorithmVersion: text('algorithm_version').notNull(),
    schemaVersion: text('schema_version').notNull(),
    durationMs: integer('duration_ms'),
    retryCount: integer('retry_count').notNull().default(0),
    fallbackTier: integer('fallback_tier'),
    estimatedCostMicros: integer('estimated_cost_micros').notNull().default(0),
    actualCostMicros: integer('actual_cost_micros'),
    validationPassed: boolean('validation_passed').notNull().default(true),
    errorCode: text('error_code'),
    idempotencyKey: uuid('idempotency_key').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerKeyUniq: uniqueIndex('petros_reflection_events_owner_key_uniq').on(
      t.institutionId,
      t.studentId,
      t.idempotencyKey,
    ),
    typeTimeIdx: index('petros_reflection_events_type_time_idx').on(t.type, t.createdAt),
    functionTimeIdx: index('petros_reflection_events_function_time_idx').on(
      t.functionKey,
      t.createdAt,
    ),
  }),
);

export type PetrosReflectionSnapshotRow = typeof petrosReflectionSnapshots.$inferSelect;
export type PetrosReflectionMapStateRow = typeof petrosReflectionMapStates.$inferSelect;
export type PetrosReflectionRecommendationRow =
  typeof petrosReflectionRecommendations.$inferSelect;
