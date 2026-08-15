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
import { petrosLearningSessions } from './petros-learning';
import { storageObjects } from './student';

export const petrosMediaObjects = pgTable(
  'petros_media_objects',
  {
    id: primaryId(),
    schemaVersion: text('schema_version').notNull(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    storageObjectId: uuid('storage_object_id').references(() => storageObjects.id, {
      onDelete: 'set null',
    }),
    sessionId: uuid('session_id').references(() => petrosLearningSessions.id, {
      onDelete: 'set null',
    }),
    kind: text('kind').notNull(),
    mode: text('mode').notNull(),
    state: text('state').notNull().default('upload_intent'),
    filename: text('filename').notNull(),
    declaredMimeType: text('declared_mime_type').notNull(),
    detectedMimeType: text('detected_mime_type'),
    sizeBytes: integer('size_bytes').notNull(),
    durationMs: integer('duration_ms'),
    width: integer('width'),
    height: integer('height'),
    pageIndex: integer('page_index').notNull().default(0),
    transform: jsonb('transform').$type<Record<string, unknown>>().notNull().default({}),
    checksumSha256: text('checksum_sha256'),
    duplicateOf: uuid('duplicate_of'),
    scanStatus: text('scan_status').notNull().default('pending'),
    structuredResult: jsonb('structured_result').$type<Record<string, unknown>>().notNull().default({}),
    correctionAudit: jsonb('correction_audit').$type<Record<string, unknown>>().notNull().default({}),
    failureCode: text('failure_code'),
    idempotencyKey: uuid('idempotency_key').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    uploadExpiresAt: timestamp('upload_expires_at', { withTimezone: true }).notNull(),
    rawMediaExpiresAt: timestamp('raw_media_expires_at', { withTimezone: true }).notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    ownerKeyUniq: uniqueIndex('petros_media_objects_owner_key_uniq').on(
      t.institutionId,
      t.studentId,
      t.idempotencyKey,
    ),
    ownerCreatedIdx: index('petros_media_objects_owner_created_idx').on(
      t.institutionId,
      t.studentId,
      t.createdAt,
    ),
    stateExpiryIdx: index('petros_media_objects_state_expiry_idx').on(
      t.state,
      t.rawMediaExpiresAt,
    ),
    hashIdx: index('petros_media_objects_hash_idx').on(
      t.institutionId,
      t.studentId,
      t.checksumSha256,
    ),
    sessionIdx: index('petros_media_objects_session_idx').on(t.sessionId),
    correlationIdx: index('petros_media_objects_correlation_idx').on(t.correlationId),
  }),
);

export const petrosMediaJobs = pgTable(
  'petros_media_jobs',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => petrosMediaObjects.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    state: text('state').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    idempotencyKey: uuid('idempotency_key').notNull(),
    functionKey: text('function_key'),
    providerRequestId: text('provider_request_id'),
    output: jsonb('output').$type<Record<string, unknown>>().notNull().default({}),
    confidenceBasisPoints: integer('confidence_basis_points'),
    errorCode: text('error_code'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    mediaKeyUniq: uniqueIndex('petros_media_jobs_media_key_uniq').on(
      t.mediaId,
      t.idempotencyKey,
    ),
    stateAttemptIdx: index('petros_media_jobs_state_attempt_idx').on(t.state, t.nextAttemptAt),
    ownerIdx: index('petros_media_jobs_owner_idx').on(t.institutionId, t.studentId, t.createdAt),
  }),
);

export const petrosModalityEvents = pgTable(
  'petros_modality_events',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id').references(() => petrosMediaObjects.id, { onDelete: 'set null' }),
    sessionId: uuid('session_id').references(() => petrosLearningSessions.id, {
      onDelete: 'set null',
    }),
    mode: text('mode').notNull(),
    type: text('type').notNull(),
    stage: text('stage'),
    functionKey: text('function_key'),
    providerKey: text('provider_key'),
    modelKey: text('model_key'),
    cacheHit: boolean('cache_hit').notNull().default(false),
    idempotencyKey: uuid('idempotency_key').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    durationMs: integer('duration_ms'),
    mediaUnits: jsonb('media_units').$type<Record<string, number>>().notNull().default({}),
    estimatedCostMicros: integer('estimated_cost_micros').notNull().default(0),
    actualCostMicros: integer('actual_cost_micros'),
    retryCount: integer('retry_count').notNull().default(0),
    fallbackTier: integer('fallback_tier'),
    confidenceBasisPoints: integer('confidence_basis_points'),
    errorCode: text('error_code'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerKeyUniq: uniqueIndex('petros_modality_events_owner_key_uniq').on(
      t.institutionId,
      t.studentId,
      t.idempotencyKey,
    ),
    modeTimeIdx: index('petros_modality_events_mode_time_idx').on(t.mode, t.createdAt),
    stageTimeIdx: index('petros_modality_events_stage_time_idx').on(t.stage, t.createdAt),
    functionTimeIdx: index('petros_modality_events_function_time_idx').on(t.functionKey, t.createdAt),
    correlationIdx: index('petros_modality_events_correlation_idx').on(t.correlationId),
  }),
);

export type PetrosMediaObjectRow = typeof petrosMediaObjects.$inferSelect;
export type PetrosMediaJobRow = typeof petrosMediaJobs.$inferSelect;
