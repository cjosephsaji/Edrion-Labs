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

export interface PetrosCheckpointRow {
  id: string;
  label: string;
  status: 'pending' | 'current' | 'complete';
}

/** Institution/student-owned, refresh-safe Stage 2 learning session state. */
export const petrosLearningSessions = pgTable(
  'petros_learning_sessions',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    clientRequestId: uuid('client_request_id').notNull(),
    stateVersion: text('state_version').notNull(),
    sessionType: text('session_type').notNull(),
    status: text('status').notNull().default('active'),
    topic: text('topic').notNull(),
    currentGoal: text('current_goal').notNull(),
    timeBudgetSeconds: integer('time_budget_seconds').notNull(),
    elapsedSeconds: integer('elapsed_seconds').notNull().default(0),
    activeSince: timestamp('active_since', { withTimezone: true }),
    maxMoves: integer('max_moves').notNull(),
    checkpoints: jsonb('checkpoints').$type<PetrosCheckpointRow[]>().notNull(),
    currentCheckpointId: text('current_checkpoint_id').notNull(),
    learnerContext: jsonb('learner_context').$type<Record<string, unknown>>().notNull().default({}),
    topicContext: jsonb('topic_context').$type<Record<string, unknown>>().notNull().default({}),
    topicProfileId: uuid('topic_profile_id'),
    topicProfileVersionId: uuid('topic_profile_version_id'),
    resolvedTopicProfile: jsonb('resolved_topic_profile')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    sourceContext: jsonb('source_context').$type<Record<string, unknown> | null>(),
    promptVersion: text('prompt_version').notNull(),
    outputSchemaVersion: text('output_schema_version').notNull(),
    planningStartedAt: timestamp('planning_started_at', { withTimezone: true }),
    closeReason: text('close_reason'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    ownerCreatedIdx: index('petros_learning_sessions_owner_created_idx').on(
      t.institutionId,
      t.studentId,
      t.createdAt,
    ),
    ownerRequestUniq: uniqueIndex('petros_learning_sessions_owner_request_uniq').on(
      t.institutionId,
      t.studentId,
      t.clientRequestId,
    ),
    planningIdx: index('petros_learning_sessions_planning_idx').on(t.status, t.planningStartedAt),
  }),
);

/** Append-oriented, audit-safe PLAN decision. No hidden reasoning or transcript is stored. */
export const petrosPlanningDecisions = pgTable(
  'petros_planning_decisions',
  {
    id: primaryId(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => petrosLearningSessions.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    status: text('status').notNull().default('planned'),
    selectedMoveType: text('selected_move_type').notNull(),
    originalMoveType: text('original_move_type'),
    targetConcept: text('target_concept').notNull(),
    studentSafeReason: text('student_safe_reason').notNull(),
    decisionFactors: jsonb('decision_factors').$type<string[]>().notNull(),
    moveParameters: jsonb('move_parameters').$type<Record<string, unknown>>().notNull(),
    expectedEvidence: text('expected_evidence').notNull(),
    progressEffect: jsonb('progress_effect').$type<Record<string, unknown>>().notNull(),
    canStream: boolean('can_stream').notNull().default(false),
    termination: jsonb('termination').$type<Record<string, unknown>>().notNull(),
    guessFirst: jsonb('guess_first').$type<Record<string, unknown>>().notNull(),
    observationResponse: jsonb('observation_response').$type<Record<string, unknown>>().notNull(),
    policyInterventions: jsonb('policy_interventions')
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    selectionPolicy: jsonb('selection_policy').$type<Record<string, unknown>>().notNull().default({}),
    observedOutcome: jsonb('observed_outcome').$type<Record<string, unknown> | null>(),
    source: text('source').notNull(),
    functionKey: text('function_key').notNull(),
    promptVersion: text('prompt_version').notNull(),
    schemaVersion: text('schema_version').notNull(),
    routeReference: jsonb('route_reference').$type<Record<string, unknown> | null>(),
    planRequestId: uuid('plan_request_id'),
    renderRequestId: uuid('render_request_id'),
    correlationId: uuid('correlation_id').notNull(),
    resultingBlockId: uuid('resulting_block_id'),
    ...timestamps,
  },
  (t) => ({
    sessionSequenceUniq: uniqueIndex('petros_planning_decisions_session_sequence_uniq').on(
      t.sessionId,
      t.sequence,
    ),
    ownerIdx: index('petros_planning_decisions_owner_idx').on(
      t.institutionId,
      t.studentId,
      t.createdAt,
    ),
    correlationIdx: index('petros_planning_decisions_correlation_idx').on(t.correlationId),
    sourceIdx: index('petros_planning_decisions_source_idx').on(t.source, t.createdAt),
  }),
);

/** Exact validated RENDER output plus learner interaction state. */
export const petrosTeachingBlocks = pgTable(
  'petros_teaching_blocks',
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
    sequence: integer('sequence').notNull(),
    type: text('type').notNull(),
    status: text('status').notNull().default('current'),
    version: integer('version').notNull().default(0),
    content: jsonb('content').$type<Record<string, unknown>>().notNull(),
    interactionState: jsonb('interaction_state')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    observedOutcome: jsonb('observed_outcome').$type<Record<string, unknown> | null>(),
    delivery: text('delivery').notNull(),
    functionKey: text('function_key').notNull(),
    promptVersion: text('prompt_version').notNull(),
    schemaVersion: text('schema_version').notNull(),
    routeReference: jsonb('route_reference').$type<Record<string, unknown> | null>(),
    correlationId: uuid('correlation_id').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    sessionSequenceUniq: uniqueIndex('petros_teaching_blocks_session_sequence_uniq').on(
      t.sessionId,
      t.sequence,
    ),
    ownerIdx: index('petros_teaching_blocks_owner_idx').on(
      t.institutionId,
      t.studentId,
      t.createdAt,
    ),
    decisionUniq: uniqueIndex('petros_teaching_blocks_decision_uniq').on(t.decisionId),
    correlationIdx: index('petros_teaching_blocks_correlation_idx').on(t.correlationId),
  }),
);

/** Append-only lifecycle/policy trail; student content is deliberately not copied here. */
export const petrosSessionEvents = pgTable(
  'petros_session_events',
  {
    id: primaryId(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => petrosLearningSessions.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    decisionId: uuid('decision_id').references(() => petrosPlanningDecisions.id, {
      onDelete: 'set null',
    }),
    blockId: uuid('block_id').references(() => petrosTeachingBlocks.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    correlationId: uuid('correlation_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index('petros_session_events_session_idx').on(t.sessionId, t.createdAt),
    ownerIdx: index('petros_session_events_owner_idx').on(
      t.institutionId,
      t.studentId,
      t.createdAt,
    ),
    typeIdx: index('petros_session_events_type_idx').on(t.type, t.createdAt),
    correlationIdx: index('petros_session_events_correlation_idx').on(t.correlationId),
  }),
);

/** Server-only question/evaluation contract. Answer keys and rubrics never enter student DTOs. */
export const petrosQuestionSpecs = pgTable(
  'petros_question_specs',
  {
    id: primaryId(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => petrosLearningSessions.id, { onDelete: 'cascade' }),
    blockId: uuid('block_id')
      .notNull()
      .references(() => petrosTeachingBlocks.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    rootQuestionId: uuid('root_question_id').notNull(),
    parentQuestionId: uuid('parent_question_id'),
    targetId: text('target_id').notNull(),
    equivalenceKey: text('equivalence_key').notNull(),
    prompt: text('prompt').notNull(),
    responseType: text('response_type').notNull(),
    choices: jsonb('choices').$type<Array<{ id: string; label: string }> | null>(),
    purpose: text('purpose').notNull(),
    evaluationMode: text('evaluation_mode').notNull(),
    acceptableAnswers: jsonb('acceptable_answers').$type<string[]>().notNull().default([]),
    correctChoiceId: text('correct_choice_id'),
    rubric: text('rubric'),
    hint: text('hint').notNull(),
    missingStep: text('missing_step').notNull(),
    workedSolution: text('worked_solution').notNull(),
    rewordedPrompt: text('reworded_prompt').notNull(),
    attemptOrdinal: integer('attempt_ordinal').notNull().default(1),
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  (t) => ({
    blockIdx: index('petros_question_specs_block_idx').on(t.blockId, t.createdAt),
    ownerIdx: index('petros_question_specs_owner_idx').on(
      t.institutionId,
      t.studentId,
      t.createdAt,
    ),
    equivalenceIdx: index('petros_question_specs_equivalence_idx').on(
      t.sessionId,
      t.equivalenceKey,
    ),
  }),
);

/** Immutable typed observations; raw answers live here while normalized evaluation is separate. */
export const petrosObservations = pgTable(
  'petros_observations',
  {
    id: primaryId(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => petrosLearningSessions.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    decisionId: uuid('decision_id').references(() => petrosPlanningDecisions.id, {
      onDelete: 'set null',
    }),
    blockId: uuid('block_id').references(() => petrosTeachingBlocks.id, { onDelete: 'set null' }),
    questionId: uuid('question_id').references(() => petrosQuestionSpecs.id, {
      onDelete: 'set null',
    }),
    type: text('type').notNull(),
    targetId: text('target_id'),
    rawAnswer: text('raw_answer'),
    confidence: text('confidence'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    schemaVersion: text('schema_version').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    correlationId: uuid('correlation_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index('petros_observations_session_idx').on(t.sessionId, t.occurredAt),
    ownerIdx: index('petros_observations_owner_idx').on(t.institutionId, t.studentId, t.occurredAt),
    typeIdx: index('petros_observations_type_idx').on(t.type, t.occurredAt),
    questionIdx: index('petros_observations_question_idx').on(t.questionId, t.occurredAt),
    correlationIdx: index('petros_observations_correlation_idx').on(t.correlationId),
  }),
);

/** Normalized answer evaluation, append-only and versioned independently from raw responses. */
export const petrosAnswerEvaluations = pgTable(
  'petros_answer_evaluations',
  {
    id: primaryId(),
    observationId: uuid('observation_id')
      .notNull()
      .references(() => petrosObservations.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => petrosLearningSessions.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => petrosQuestionSpecs.id, { onDelete: 'cascade' }),
    correctness: text('correctness').notNull(),
    creditBasisPoints: integer('credit_basis_points').notNull(),
    evidence: jsonb('evidence').$type<string[]>().notNull().default([]),
    errorClass: text('error_class').notNull(),
    misconception: text('misconception'),
    feedback: text('feedback').notNull(),
    safeNextHint: text('safe_next_hint'),
    highValueMisconception: boolean('high_value_misconception').notNull().default(false),
    fragileSuccess: boolean('fragile_success').notNull().default(false),
    evaluator: text('evaluator').notNull(),
    functionKey: text('function_key'),
    promptVersion: text('prompt_version').notNull(),
    schemaVersion: text('schema_version').notNull(),
    requestId: uuid('request_id'),
    routeReference: jsonb('route_reference').$type<Record<string, unknown> | null>(),
    correlationId: uuid('correlation_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    observationUniq: uniqueIndex('petros_answer_evaluations_observation_uniq').on(t.observationId),
    ownerIdx: index('petros_answer_evaluations_owner_idx').on(
      t.institutionId,
      t.studentId,
      t.createdAt,
    ),
    matrixIdx: index('petros_answer_evaluations_matrix_idx').on(t.correctness, t.createdAt),
    correlationIdx: index('petros_answer_evaluations_correlation_idx').on(t.correlationId),
  }),
);

/** Refresh-safe ladder state keyed by semantic equivalence, not generated wording. */
export const petrosStruggleStretches = pgTable(
  'petros_struggle_stretches',
  {
    id: primaryId(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => petrosLearningSessions.id, { onDelete: 'cascade' }),
    blockId: uuid('block_id')
      .notNull()
      .references(() => petrosTeachingBlocks.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    targetId: text('target_id').notNull(),
    equivalenceKey: text('equivalence_key').notNull(),
    wrongAttemptCount: integer('wrong_attempt_count').notNull().default(0),
    ladderLevel: integer('ladder_level').notNull().default(0),
    status: text('status').notNull().default('active'),
    rewordedQuestionId: uuid('reworded_question_id'),
    lastObservationId: uuid('last_observation_id'),
    recoveredAt: timestamp('recovered_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    equivalenceUniq: uniqueIndex('petros_struggle_stretches_equivalence_uniq').on(
      t.sessionId,
      t.equivalenceKey,
    ),
    ownerIdx: index('petros_struggle_stretches_owner_idx').on(
      t.institutionId,
      t.studentId,
      t.createdAt,
    ),
    statusIdx: index('petros_struggle_stretches_status_idx').on(t.status, t.updatedAt),
  }),
);

/** Composer questions become route detours, never chat messages. */
export const petrosSessionDetours = pgTable(
  'petros_session_detours',
  {
    id: primaryId(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => petrosLearningSessions.id, { onDelete: 'cascade' }),
    observationId: uuid('observation_id')
      .notNull()
      .references(() => petrosObservations.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    status: text('status').notNull().default('pending'),
    action: text('action').notNull().default('pending'),
    acknowledgement: text('acknowledgement'),
    routeChange: text('route_change'),
    returnPlan: text('return_plan'),
    changedDecisionId: uuid('changed_decision_id').references(() => petrosPlanningDecisions.id, {
      onDelete: 'set null',
    }),
    rejoinedAt: timestamp('rejoined_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    sessionIdx: index('petros_session_detours_session_idx').on(t.sessionId, t.createdAt),
    ownerIdx: index('petros_session_detours_owner_idx').on(
      t.institutionId,
      t.studentId,
      t.createdAt,
    ),
    statusIdx: index('petros_session_detours_status_idx').on(t.status, t.createdAt),
  }),
);

/** Idempotent command ledger and duplicate in-flight protection. */
export const petrosSessionCommands = pgTable(
  'petros_session_commands',
  {
    id: primaryId(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => petrosLearningSessions.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    idempotencyKey: uuid('idempotency_key').notNull(),
    command: text('command').notNull(),
    status: text('status').notNull().default('in_progress'),
    response: jsonb('response').$type<Record<string, unknown> | null>(),
    errorCode: text('error_code'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    commandUniq: uniqueIndex('petros_session_commands_session_key_uniq').on(
      t.sessionId,
      t.idempotencyKey,
    ),
    ownerIdx: index('petros_session_commands_owner_idx').on(
      t.institutionId,
      t.studentId,
      t.createdAt,
    ),
    inFlightIdx: index('petros_session_commands_in_flight_idx').on(
      t.sessionId,
      t.status,
      t.createdAt,
    ),
  }),
);

export type PetrosLearningSession = typeof petrosLearningSessions.$inferSelect;
export type NewPetrosLearningSession = typeof petrosLearningSessions.$inferInsert;
export type PetrosPlanningDecisionRow = typeof petrosPlanningDecisions.$inferSelect;
export type NewPetrosPlanningDecision = typeof petrosPlanningDecisions.$inferInsert;
export type PetrosTeachingBlockRow = typeof petrosTeachingBlocks.$inferSelect;
export type NewPetrosTeachingBlock = typeof petrosTeachingBlocks.$inferInsert;
export type PetrosSessionCommand = typeof petrosSessionCommands.$inferSelect;
export type PetrosQuestionSpecRow = typeof petrosQuestionSpecs.$inferSelect;
export type PetrosObservationRow = typeof petrosObservations.$inferSelect;
export type PetrosAnswerEvaluationRow = typeof petrosAnswerEvaluations.$inferSelect;
export type PetrosStruggleStretchRow = typeof petrosStruggleStretches.$inferSelect;
export type PetrosSessionDetourRow = typeof petrosSessionDetours.$inferSelect;
