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
import { primaryId, timestamps } from './_helpers';
import { campuses } from './campuses';
import { institutions } from './institutions';
import { students } from './people';
import { petrosLearningSessions } from './petros-learning';

export const petrosSessionIntents = pgTable(
  'petros_session_intents',
  {
    id: primaryId(),
    schemaVersion: text('schema_version').notNull(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    door: text('door').notNull(),
    sessionType: text('session_type').notNull(),
    sourceEntityIds: jsonb('source_entity_ids').$type<string[]>().notNull(),
    sourceFingerprint: text('source_fingerprint').notNull(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    resolvedIntent: jsonb('resolved_intent').$type<Record<string, unknown>>().notNull(),
    status: text('status').notNull().default('resolved'),
    sessionId: uuid('session_id').references(() => petrosLearningSessions.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    invalidatedAt: timestamp('invalidated_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    ownerKeyUniq: uniqueIndex('petros_session_intents_owner_key_uniq').on(
      t.institutionId,
      t.studentId,
      t.idempotencyKey,
    ),
    ownerCreatedIdx: index('petros_session_intents_owner_created_idx').on(
      t.institutionId,
      t.studentId,
      t.createdAt,
    ),
    sourceIdx: index('petros_session_intents_source_idx').on(t.door, t.createdAt),
    correlationIdx: index('petros_session_intents_correlation_idx').on(t.correlationId),
  }),
);

export const petrosDoorEvents = pgTable(
  'petros_door_events',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    intentId: uuid('intent_id').references(() => petrosSessionIntents.id, {
      onDelete: 'set null',
    }),
    sessionId: uuid('session_id').references(() => petrosLearningSessions.id, {
      onDelete: 'set null',
    }),
    door: text('door').notNull(),
    sessionType: text('session_type').notNull(),
    type: text('type').notNull(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    durationMs: integer('duration_ms'),
    reasonCode: text('reason_code'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerKeyUniq: uniqueIndex('petros_door_events_owner_key_uniq').on(
      t.institutionId,
      t.studentId,
      t.idempotencyKey,
    ),
    typeIdx: index('petros_door_events_type_idx').on(t.type, t.createdAt),
    dimensionsIdx: index('petros_door_events_dimensions_idx').on(
      t.door,
      t.sessionType,
      t.createdAt,
    ),
    correlationIdx: index('petros_door_events_correlation_idx').on(t.correlationId),
  }),
);
