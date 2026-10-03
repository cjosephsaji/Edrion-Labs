import { pgTable, uuid, text, jsonb, timestamp, integer, doublePrecision, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core';

/** Current acknowledged workspace plus immutable checkpoint/operation history. Never learning evidence. */
export const petrosWorkspaces = pgTable('petros_workspaces', {
  id: uuid('id').primaryKey(),
  institutionId: uuid('institution_id').notNull(),
  studentId: uuid('student_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  blockId: uuid('block_id').notNull(),
  version: integer('version').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  policy: jsonb('policy').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ block: uniqueIndex('petros_workspace_block').on(t.blockId),
  owner: index('petros_workspace_owner').on(t.institutionId, t.studentId, t.sessionId) }));

export const petrosWorkspaceCheckpoints = pgTable('petros_workspace_checkpoints', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull(),
  institutionId: uuid('institution_id').notNull(),
  studentId: uuid('student_id').notNull(),
  version: integer('version').notNull(),
  branchId: text('branch_id').notNull(),
  parentCheckpointId: uuid('parent_checkpoint_id'),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ version: uniqueIndex('petros_workspace_checkpoint_version').on(t.workspaceId, t.version),
  owner: index('petros_workspace_checkpoint_owner').on(t.institutionId, t.studentId, t.workspaceId) }));

export const petrosWorkspaceOperations = pgTable('petros_workspace_operations', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull(),
  studentId: uuid('student_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  blockId: uuid('block_id').notNull(),
  operationId: uuid('operation_id').notNull(),
  commandHash: text('command_hash').notNull(),
  status: text('status').notNull(),
  command: jsonb('command').$type<Record<string, unknown>>().notNull(),
  checkpointId: uuid('checkpoint_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ operation: uniqueIndex('petros_workspace_operation_key').on(t.blockId, t.operationId),
  owner: index('petros_workspace_operation_owner').on(t.institutionId, t.studentId, t.blockId) }));

/** Hidden server criterion, pinned to one immutable acknowledged checkpoint. */
export const petrosWorkspacePredictionChallenges = pgTable('petros_workspace_prediction_challenges', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull(),
  institutionId: uuid('institution_id').notNull(),
  studentId: uuid('student_id').notNull(),
  requestId: uuid('request_id').notNull(),
  requestHash: text('request_hash').notNull(),
  checkpointId: uuid('checkpoint_id').notNull(),
  programHash: text('program_hash').notNull(),
  programRevision: integer('program_revision').notNull(),
  experimentVersion: integer('experiment_version').notNull(),
  modelId: text('model_id').notNull(),
  capabilityId: text('capability_id').notNull(),
  solver: text('solver').notNull(),
  prompt: text('prompt').notNull(),
  targetTime: doublePrecision('target_time').notNull(),
  outputPort: text('output_port').notNull(),
  unit: text('unit').notNull(),
  referenceValue: doublePrecision('reference_value').notNull(),
  tolerance: doublePrecision('tolerance').notNull(),
  priorExploration: boolean('prior_exploration').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ request: uniqueIndex('petros_workspace_prediction_request').on(t.workspaceId, t.requestId),
  owner: index('petros_workspace_prediction_owner').on(t.institutionId, t.studentId, t.workspaceId) }));

/** One immutable answer per challenge, deliberately barred from mastery admission. */
export const petrosWorkspacePredictionResponses = pgTable('petros_workspace_prediction_responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  challengeId: uuid('challenge_id').notNull().unique(),
  workspaceId: uuid('workspace_id').notNull(),
  institutionId: uuid('institution_id').notNull(),
  studentId: uuid('student_id').notNull(),
  requestId: uuid('request_id').notNull(),
  requestHash: text('request_hash').notNull(),
  predictedValue: doublePrecision('predicted_value').notNull(),
  assistance: text('assistance').notNull(),
  result: text('result').notNull(),
  referenceValue: doublePrecision('reference_value').notNull(),
  criterionTolerance: doublePrecision('criterion_tolerance').notNull(),
  masteryAdmitted: boolean('mastery_admitted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ request: uniqueIndex('petros_workspace_prediction_response_request').on(t.workspaceId, t.requestId),
  owner: index('petros_workspace_prediction_response_owner').on(t.institutionId, t.studentId, t.workspaceId) }));
