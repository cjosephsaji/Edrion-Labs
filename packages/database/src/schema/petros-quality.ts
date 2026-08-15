import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';

/** Synthetic evaluation data only. No student foreign key exists by design. */
export const petrosQualityRuns = pgTable('petros_quality_runs', {
  id: primaryId(),
  externalRunId: text('external_run_id').notNull(),
  label: text('label').notNull(),
  status: text('status').notNull(),
  mode: text('mode').notNull(),
  source: text('source').notNull().default('evaluation'),
  environment: text('environment').notNull().default('evaluation'),
  suite: text('suite').notNull(),
  seed: bigint('seed', { mode: 'number' }).notNull(),
  gate: text('gate').notNull(),
  corpusVersion: text('corpus_version').notNull(),
  rubricVersion: text('rubric_version').notNull(),
  promptVersion: text('prompt_version').notNull(),
  schemaVersion: text('schema_version').notNull(),
  profileVersion: text('profile_version').notNull(),
  routingVersion: text('routing_version').notNull(),
  codeVersion: text('code_version').notNull(),
  selection: jsonb('selection').$type<Record<string, unknown>>().notNull().default({}),
  limits: jsonb('limits').$type<Record<string, unknown>>().notNull().default({}),
  totals: jsonb('totals').$type<Record<string, unknown>>().notNull().default({}),
  dimensions: jsonb('dimensions').$type<Record<string, unknown>>().notNull().default({}),
  blockingFailures: jsonb('blocking_failures').$type<string[]>().notNull().default([]),
  warnings: jsonb('warnings').$type<string[]>().notNull().default([]),
  comparison: jsonb('comparison').$type<Record<string, unknown> | null>(),
  report: jsonb('report').$type<Record<string, unknown>>().notNull(),
  costMicros: bigint('cost_micros', { mode: 'number' }).notNull().default(0),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  latencyMs: integer('latency_ms').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  ...actorColumns,
  ...timestamps,
}, (table) => ({
  externalRunUniq: uniqueIndex('petros_quality_runs_external_run_uniq').on(table.externalRunId),
  statusIdx: index('petros_quality_runs_status_idx').on(table.status, table.createdAt),
  gateIdx: index('petros_quality_runs_gate_idx').on(table.gate, table.createdAt),
}));

export const petrosQualitySessions = pgTable('petros_quality_sessions', {
  id: primaryId(),
  runId: uuid('run_id').notNull().references(() => petrosQualityRuns.id, { onDelete: 'cascade' }),
  externalSessionId: text('external_session_id').notNull(),
  caseId: text('case_id').notNull(),
  topicKey: text('topic_key').notNull(),
  topicTitle: text('topic_title').notNull(),
  subject: text('subject').notNull(),
  personaId: text('persona_id').notNull(),
  goal: text('goal').notNull(),
  seed: bigint('seed', { mode: 'number' }).notNull(),
  totalScoreBasisPoints: integer('total_score_basis_points').notNull(),
  status: text('status').notNull(),
  blockingFailures: jsonb('blocking_failures').$type<string[]>().notNull().default([]),
  warnings: jsonb('warnings').$type<string[]>().notNull().default([]),
  transcript: jsonb('transcript').$type<Record<string, unknown>>().notNull(),
  ...timestamps,
}, (table) => ({
  runSessionUniq: uniqueIndex('petros_quality_sessions_run_session_uniq').on(table.runId, table.externalSessionId),
  matrixIdx: index('petros_quality_sessions_matrix_idx').on(table.runId, table.topicKey, table.personaId),
}));

/** Normalized move/observation/artifact/usage/error records retain drill-down evidence. */
export const petrosQualityEvents = pgTable('petros_quality_events', {
  id: primaryId(),
  runId: uuid('run_id').notNull().references(() => petrosQualityRuns.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull().references(() => petrosQualitySessions.id, { onDelete: 'cascade' }),
  externalEventId: text('external_event_id').notNull(),
  eventType: text('event_type').notNull(),
  moveType: text('move_type'),
  functionKey: text('function_key'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  sessionEventUniq: uniqueIndex('petros_quality_events_session_event_uniq').on(table.sessionId, table.externalEventId),
  typeIdx: index('petros_quality_events_type_idx').on(table.runId, table.eventType),
}));

export const petrosQualityScores = pgTable('petros_quality_scores', {
  id: primaryId(),
  runId: uuid('run_id').notNull().references(() => petrosQualityRuns.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull().references(() => petrosQualitySessions.id, { onDelete: 'cascade' }),
  dimension: text('dimension').notNull(),
  scoreBasisPoints: integer('score_basis_points').notNull(),
  maxScoreBasisPoints: integer('max_score_basis_points').notNull().default(500),
  evaluator: text('evaluator').notNull(),
  uncertaintyBasisPoints: integer('uncertainty_basis_points').notNull(),
  rationale: text('rationale').notNull(),
  evidence: jsonb('evidence').$type<Array<Record<string, unknown>>>().notNull().default([]),
  rubricVersion: text('rubric_version').notNull(),
  ...timestamps,
}, (table) => ({
  sessionDimensionUniq: uniqueIndex('petros_quality_scores_session_dimension_uniq').on(table.sessionId, table.dimension),
  dimensionIdx: index('petros_quality_scores_dimension_idx').on(table.runId, table.dimension),
}));

export const petrosQualityBaselines = pgTable('petros_quality_baselines', {
  id: primaryId(),
  runId: uuid('run_id').notNull().references(() => petrosQualityRuns.id, { onDelete: 'restrict' }),
  selected: boolean('selected').notNull().default(true),
  reason: text('reason').notNull(),
  promotedBy: uuid('promoted_by'),
  promotedAt: timestamp('promoted_at', { withTimezone: true }).notNull().defaultNow(),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  runUniq: uniqueIndex('petros_quality_baselines_run_uniq').on(table.runId),
  selectedIdx: index('petros_quality_baselines_selected_idx').on(table.selected, table.promotedAt),
}));

export const petrosQualityAudit = pgTable('petros_quality_audit', {
  id: primaryId(),
  runId: uuid('run_id').references(() => petrosQualityRuns.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  actorRef: text('actor_ref'),
  reason: text('reason').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PetrosQualityRun = typeof petrosQualityRuns.$inferSelect;
export type NewPetrosQualityRun = typeof petrosQualityRuns.$inferInsert;
