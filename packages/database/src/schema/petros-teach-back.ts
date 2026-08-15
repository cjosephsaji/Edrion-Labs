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
import { petrosLearningSessions, petrosTeachingBlocks } from './petros-learning';
import { petrosMediaObjects } from './petros-input-modes';

export const petrosTeachBackSessions = pgTable(
  'petros_teach_back_sessions',
  {
    id: primaryId(),
    learningSessionId: uuid('learning_session_id')
      .notNull()
      .references(() => petrosLearningSessions.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    stateVersion: text('state_version').notNull(),
    status: text('status').notNull().default('active'),
    topic: text('topic').notNull(),
    scope: text('scope'),
    audienceLevel: text('audience_level').notNull(),
    audienceLabel: text('audience_label').notNull(),
    mode: text('mode').notNull(),
    language: text('language').notNull(),
    coverageChecklist: jsonb('coverage_checklist')
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    currentGapType: text('current_gap_type').notNull().default('none'),
    currentGapFingerprint: text('current_gap_fingerprint'),
    probesOnCurrentGap: integer('probes_on_current_gap').notNull().default(0),
    movesUsed: integer('moves_used').notNull().default(0),
    maxMoves: integer('max_moves').notNull(),
    timeBudgetSeconds: integer('time_budget_seconds').notNull(),
    elapsedSeconds: integer('elapsed_seconds').notNull().default(0),
    activeSince: timestamp('active_since', { withTimezone: true }),
    helpUseCount: integer('help_use_count').notNull().default(0),
    verdict: jsonb('verdict').$type<Record<string, unknown> | null>(),
    artifactBundleId: uuid('artifact_bundle_id'),
    repeatedFromSessionId: uuid('repeated_from_session_id'),
    closeReason: text('close_reason'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    learningSessionUniq: uniqueIndex('petros_teach_back_sessions_learning_session_uniq').on(
      t.learningSessionId,
    ),
    ownerCreatedIdx: index('petros_teach_back_sessions_owner_created_idx').on(
      t.institutionId,
      t.studentId,
      t.createdAt,
    ),
    statusIdx: index('petros_teach_back_sessions_status_idx').on(t.status, t.updatedAt),
    repeatIdx: index('petros_teach_back_sessions_repeat_idx').on(t.repeatedFromSessionId),
  }),
);

export const petrosTeachBackSegments = pgTable(
  'petros_teach_back_segments',
  {
    id: primaryId(),
    teachBackSessionId: uuid('teach_back_session_id')
      .notNull()
      .references(() => petrosTeachBackSessions.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    source: text('source').notNull(),
    text: text('text').notNull(),
    originalTextHash: text('original_text_hash').notNull(),
    corrected: boolean('corrected').notNull().default(false),
    correctionCount: integer('correction_count').notNull().default(0),
    mediaId: uuid('media_id').references(() => petrosMediaObjects.id, {
      onDelete: 'set null',
    }),
    transcriptionConfidenceBasisPoints: integer('transcription_confidence_basis_points'),
    responseToFollowUpId: uuid('response_to_follow_up_id'),
    analysis: jsonb('analysis').$type<Record<string, unknown>>().notNull(),
    analysisFunctionKey: text('analysis_function_key').notNull(),
    analysisRequestId: text('analysis_request_id'),
    analysisRouteReference: jsonb('analysis_route_reference').$type<Record<
      string,
      unknown
    > | null>(),
    correlationId: uuid('correlation_id').notNull(),
    ...timestamps,
  },
  (t) => ({
    sessionOrdinalUniq: uniqueIndex('petros_teach_back_segments_session_ordinal_uniq').on(
      t.teachBackSessionId,
      t.ordinal,
    ),
    ownerIdx: index('petros_teach_back_segments_owner_idx').on(
      t.institutionId,
      t.studentId,
      t.createdAt,
    ),
    mediaIdx: index('petros_teach_back_segments_media_idx').on(t.mediaId),
  }),
);

export const petrosTeachBackFollowUps = pgTable(
  'petros_teach_back_follow_ups',
  {
    id: primaryId(),
    teachBackSessionId: uuid('teach_back_session_id')
      .notNull()
      .references(() => petrosTeachBackSessions.id, { onDelete: 'cascade' }),
    segmentId: uuid('segment_id')
      .notNull()
      .references(() => petrosTeachBackSegments.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('open'),
    gapType: text('gap_type').notNull(),
    gapFingerprint: text('gap_fingerprint').notNull(),
    probeNumber: integer('probe_number').notNull(),
    content: jsonb('content').$type<Record<string, unknown>>().notNull(),
    functionKey: text('function_key').notNull(),
    providerRequestId: text('provider_request_id'),
    routeReference: jsonb('route_reference').$type<Record<string, unknown> | null>(),
    correlationId: uuid('correlation_id').notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    sessionIdx: index('petros_teach_back_follow_ups_session_idx').on(
      t.teachBackSessionId,
      t.createdAt,
    ),
    openIdx: index('petros_teach_back_follow_ups_open_idx').on(t.status, t.createdAt),
    ownerIdx: index('petros_teach_back_follow_ups_owner_idx').on(
      t.institutionId,
      t.studentId,
      t.createdAt,
    ),
  }),
);

export const petrosTeachBackCommands = pgTable(
  'petros_teach_back_commands',
  {
    id: primaryId(),
    teachBackSessionId: uuid('teach_back_session_id')
      .notNull()
      .references(() => petrosTeachBackSessions.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').notNull(),
    studentId: uuid('student_id').notNull(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('started'),
    response: jsonb('response').$type<Record<string, unknown> | null>(),
    errorCode: text('error_code'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    ownerKeyUniq: uniqueIndex('petros_teach_back_commands_owner_key_uniq').on(
      t.institutionId,
      t.studentId,
      t.idempotencyKey,
    ),
  }),
);

/** Content-free aggregate trace. Student explanation text never enters this table. */
export const petrosTeachBackEvents = pgTable(
  'petros_teach_back_events',
  {
    id: primaryId(),
    teachBackSessionId: uuid('teach_back_session_id')
      .notNull()
      .references(() => petrosTeachBackSessions.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').notNull(),
    studentId: uuid('student_id').notNull(),
    segmentId: uuid('segment_id').references(() => petrosTeachBackSegments.id, {
      onDelete: 'set null',
    }),
    followUpId: uuid('follow_up_id').references(() => petrosTeachBackFollowUps.id, {
      onDelete: 'set null',
    }),
    artifactBlockId: uuid('artifact_block_id').references(() => petrosTeachingBlocks.id, {
      onDelete: 'set null',
    }),
    type: text('type').notNull(),
    mode: text('mode').notNull(),
    gapType: text('gap_type'),
    functionKey: text('function_key'),
    providerKey: text('provider_key'),
    modelKey: text('model_key'),
    durationMs: integer('duration_ms'),
    estimatedCostMicros: integer('estimated_cost_micros').notNull().default(0),
    actualCostMicros: integer('actual_cost_micros'),
    retryCount: integer('retry_count').notNull().default(0),
    fallbackTier: integer('fallback_tier'),
    validationPassed: boolean('validation_passed').notNull().default(true),
    uncertaintyBasisPoints: integer('uncertainty_basis_points'),
    errorCode: text('error_code'),
    idempotencyKey: uuid('idempotency_key').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerKeyUniq: uniqueIndex('petros_teach_back_events_owner_key_uniq').on(
      t.institutionId,
      t.studentId,
      t.idempotencyKey,
    ),
    typeTimeIdx: index('petros_teach_back_events_type_time_idx').on(t.type, t.createdAt),
    functionTimeIdx: index('petros_teach_back_events_function_time_idx').on(
      t.functionKey,
      t.createdAt,
    ),
    correlationIdx: index('petros_teach_back_events_correlation_idx').on(t.correlationId),
  }),
);

export type PetrosTeachBackSessionRow = typeof petrosTeachBackSessions.$inferSelect;
export type PetrosTeachBackSegmentRow = typeof petrosTeachBackSegments.$inferSelect;
export type PetrosTeachBackFollowUpRow = typeof petrosTeachBackFollowUps.$inferSelect;
