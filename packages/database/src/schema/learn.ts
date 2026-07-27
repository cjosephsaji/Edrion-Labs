import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { students } from './people';
import { independentUsers } from './users';

/** Exactly one owner. The repo-wide Learn tenancy form (see migration 0103). */
const ownerXor = (studentId: unknown, independentUserId: unknown) =>
  sql`num_nonnulls(${studentId}, ${independentUserId}) = 1`;

/** At most one owner — for ledgers whose owner FKs are ON DELETE SET NULL. */
const ownerAtMostOne = (studentId: unknown, independentUserId: unknown) =>
  sql`num_nonnulls(${studentId}, ${independentUserId}) <= 1`;

export const learnTopics = pgTable(
  'learn_topics',
  {
    id: primaryId(),
    topicKey: text('topic_key').notNull(),
    title: text('title').notNull(),
    subjectLabel: text('subject_label').notNull(),
    curriculumKey: text('curriculum_key').notNull().default('generic'),
    domainArchetype: text('domain_archetype').notNull().default('procedural_quantitative'),
    institutionId: uuid('institution_id').references(() => institutions.id),
    source: text('source').notNull().default('ai'),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    topicCurriculumUq: uniqueIndex('learn_topics_topic_curriculum_uq').on(t.topicKey, t.curriculumKey),
  }),
);

export const conceptAtoms = pgTable(
  'concept_atoms',
  {
    id: primaryId(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => learnTopics.id),
    atomKind: text('atom_kind').notNull(),
    variantKey: text('variant_key').notNull().default('default'),
    content: jsonb('content').$type<Record<string, unknown>>().notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    atomUq: uniqueIndex('concept_atoms_uq').on(t.topicId, t.atomKind, t.variantKey, t.promptVersion),
  }),
);

export const learningPaths = pgTable(
  'learning_paths',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id),
    studentId: uuid('student_id').references(() => students.id),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id),
    title: text('title').notNull(),
    subjectLabel: text('subject_label').notNull(),
    source: text('source').notNull(),
    metaLine: text('meta_line'),
    goal: jsonb('goal').$type<Record<string, unknown>>(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    version: integer('version').notNull().default(1),
  },
  (t) => ({
    ownerXor: check('learning_paths_owner_ck', ownerXor(t.studentId, t.independentUserId)),
  }),
);

export const learningPathItems = pgTable(
  'learning_path_items',
  {
    id: primaryId(),
    pathId: uuid('path_id')
      .notNull()
      .references(() => learningPaths.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => learnTopics.id),
    sequence: integer('sequence').notNull(),
    whyHere: text('why_here'),
    optionalBranch: integer('optional_branch').notNull().default(0),
    status: text('status').notNull().default('upcoming'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
  },
  (t) => ({
    pathSeqUq: uniqueIndex('learning_path_items_path_seq_uq').on(t.pathId, t.sequence),
  }),
);

export const learnTopicProfiles = pgTable(
  'learn_topic_profiles',
  {
    id: primaryId(),
    learnTopicId: uuid('learn_topic_id').references(() => learnTopics.id, { onDelete: 'cascade' }),
    topicKey: text('topic_key').notNull(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    title: text('title').notNull(),
    profile: jsonb('profile').$type<Record<string, unknown>>().notNull(),
    profileSchemaVersion: integer('profile_schema_version').notNull().default(1),
    source: text('source').notNull(),
    overriddenBy: uuid('overridden_by'),
    model: text('model'),
    promptVersion: text('prompt_version'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    ownerXor: check('learn_topic_profiles_owner_ck', ownerXor(t.institutionId, t.independentUserId)),
    institutionTopicIdUq: uniqueIndex('learn_topic_profiles_institution_topic_id_uq')
      .on(t.institutionId, t.learnTopicId)
      .where(sql`${t.institutionId} IS NOT NULL AND ${t.learnTopicId} IS NOT NULL`),
    institutionTopicKeyUq: uniqueIndex('learn_topic_profiles_institution_topic_key_uq')
      .on(t.institutionId, t.topicKey)
      .where(sql`${t.institutionId} IS NOT NULL`),
    independentTopicIdUq: uniqueIndex('learn_topic_profiles_independent_topic_id_uq')
      .on(t.independentUserId, t.learnTopicId)
      .where(sql`${t.independentUserId} IS NOT NULL AND ${t.learnTopicId} IS NOT NULL`),
    independentTopicKeyUq: uniqueIndex('learn_topic_profiles_independent_topic_key_uq')
      .on(t.independentUserId, t.topicKey)
      .where(sql`${t.independentUserId} IS NOT NULL`),
  }),
);

export const learnSessions = pgTable(
  'learn_sessions',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id),
    studentId: uuid('student_id').references(() => students.id),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => learnTopics.id),
    topicProfileId: uuid('topic_profile_id').references(() => learnTopicProfiles.id, {
      onDelete: 'set null',
    }),
    pathItemId: uuid('path_item_id').references(() => learningPathItems.id),
    groundingKnowledgeItemId: uuid('grounding_knowledge_item_id'),
    entryPoint: text('entry_point'),
    entryRef: jsonb('entry_ref').$type<Record<string, unknown>>(),
    status: text('status').notNull().default('active'),
    orchestratorStatus: text('orchestrator_status'),
    state: jsonb('state').$type<Record<string, unknown>>().notNull().default({}),
    sessionContext: jsonb('session_context').$type<Record<string, unknown>>().notNull().default({}),
    policySnapshot: jsonb('policy_snapshot').$type<Record<string, unknown>>().notNull().default({}),
    // Plan-02 leftovers, nullable since 0103: the orchestrator has no spine/plan
    // and must not write stubs. The legacy student/learn/ surface still fills them.
    spine: jsonb('spine').$type<unknown[]>(),
    sessionPlan: jsonb('session_plan').$type<Record<string, unknown>>(),
    timeBudgetMinutes: integer('time_budget_minutes'),
    elapsedMinutes: integer('elapsed_minutes').notNull().default(0),
    checkpointsTotal: integer('checkpoints_total').notNull().default(0),
    checkpointsDone: integer('checkpoints_done').notNull().default(0),
    planMoveCount: integer('plan_move_count').notNull().default(0),
    endReason: text('end_reason'),
    activeKey: text('active_key'),
    lastEventSeq: bigint('last_event_seq', { mode: 'number' }).notNull().default(0),
    lastBlockSeq: bigint('last_block_seq', { mode: 'number' }).notNull().default(0),
    summary: jsonb('summary').$type<Record<string, unknown>>(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    orchestratorUpdatedAt: timestamp('orchestrator_updated_at', { withTimezone: true }),
    evidence: jsonb('evidence').$type<string[]>().notNull().default([]),
    version: integer('version').notNull().default(1),
  },
  (t) => ({
    ownerXor: check('learn_sessions_owner_ck', ownerXor(t.studentId, t.independentUserId)),
    studentIdx: index('learn_sessions_student_idx').on(t.studentId, t.startedAt),
    indepIdx: index('learn_sessions_indep_idx').on(t.independentUserId, t.startedAt),
    studentActiveOrchestratorUq: uniqueIndex('learn_sessions_student_active_orchestrator_uq')
      .on(t.studentId)
      .where(
        sql`${t.studentId} IS NOT NULL AND ${t.entryPoint} IS NOT NULL AND ${t.orchestratorStatus} IN ('created','active','awaiting_response','paused','closing')`,
      ),
    independentActiveOrchestratorUq: uniqueIndex('learn_sessions_independent_active_orchestrator_uq')
      .on(t.independentUserId)
      .where(
        sql`${t.independentUserId} IS NOT NULL AND ${t.entryPoint} IS NOT NULL AND ${t.orchestratorStatus} IN ('created','active','awaiting_response','paused','closing')`,
      ),
  }),
);

export const learnSessionBlocks = pgTable(
  'learn_session_blocks',
  {
    id: primaryId(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => learnSessions.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    blockType: text('block_type').notNull(),
    // Plan-02 leftover, nullable since 0103 (see learn_sessions.spine).
    spineStep: text('spine_step'),
    content: jsonb('content').$type<Record<string, unknown>>().notNull(),
    state: jsonb('state').$type<Record<string, unknown>>().notNull().default({}),
    moveType: text('move_type'),
    blockSchemaVersion: integer('block_schema_version').notNull().default(1),
    reasoning: text('reasoning'),
    degraded: boolean('degraded').notNull().default(false),
    interactionState: jsonb('interaction_state').$type<Record<string, unknown>>().notNull().default({}),
    streamSeq: bigint('stream_seq', { mode: 'number' }),
    renderStatus: text('render_status'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionSeqUq: uniqueIndex('learn_session_blocks_session_seq_uq').on(t.sessionId, t.sequence),
    sessionStreamSeqUq: uniqueIndex('learn_session_blocks_session_stream_seq_uq')
      .on(t.sessionId, t.streamSeq)
      .where(sql`${t.streamSeq} IS NOT NULL`),
  }),
);

export const learnAttempts = pgTable(
  'learn_attempts',
  {
    id: primaryId(),
    sessionId: uuid('session_id').references(() => learnSessions.id, { onDelete: 'set null' }),
    blockId: uuid('block_id').references(() => learnSessionBlocks.id, { onDelete: 'set null' }),
    questionId: text('question_id'),
    studentId: uuid('student_id').references(() => students.id),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id),
    kind: text('kind').notNull(),
    input: jsonb('input').$type<Record<string, unknown>>().notNull(),
    evaluation: jsonb('evaluation').$type<Record<string, unknown>>().notNull(),
    hintsUsed: integer('hints_used').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerXor: check('learn_attempts_owner_ck', ownerXor(t.studentId, t.independentUserId)),
    sessionBlockQuestionUq: uniqueIndex('learn_attempts_session_block_question_uq')
      .on(t.sessionId, t.blockId, t.questionId)
      .where(
        sql`${t.sessionId} IS NOT NULL AND ${t.blockId} IS NOT NULL AND ${t.questionId} IS NOT NULL`,
      ),
  }),
);

export const learnerMastery = pgTable(
  'learner_mastery',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    atomId: uuid('atom_id')
      .notNull()
      .references(() => conceptAtoms.id, { onDelete: 'cascade' }),
    // Hyperspec §6: display mastery m = (rating - 800) / 800, so 1200 reads 0.5.
    rating: integer('rating').notNull().default(1200),
    attempts: integer('attempts').notNull().default(0),
    correctWeight: numeric('correct_weight').notNull().default('0'),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    ownerXor: check('learner_mastery_owner_ck', ownerXor(t.studentId, t.independentUserId)),
    studentAtomUq: uniqueIndex('learner_mastery_student_atom_uq')
      .on(t.studentId, t.atomId)
      .where(sql`${t.studentId} IS NOT NULL`),
    independentAtomUq: uniqueIndex('learner_mastery_independent_atom_uq')
      .on(t.independentUserId, t.atomId)
      .where(sql`${t.independentUserId} IS NOT NULL`),
  }),
);

export const learnerModelEvents = pgTable(
  'learner_model_events',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    sessionId: uuid('session_id').references(() => learnSessions.id, { onDelete: 'set null' }),
    attemptId: uuid('attempt_id').references(() => learnAttempts.id, { onDelete: 'set null' }),
    atomId: uuid('atom_id').references(() => conceptAtoms.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    idempotencyKey: text('idempotency_key').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerXor: check('learner_model_events_owner_ck', ownerXor(t.studentId, t.independentUserId)),
    studentIdempotencyUq: uniqueIndex('learner_model_events_student_idempotency_uq')
      .on(t.studentId, t.idempotencyKey)
      .where(sql`${t.studentId} IS NOT NULL`),
    independentIdempotencyUq: uniqueIndex('learner_model_events_independent_idempotency_uq')
      .on(t.independentUserId, t.idempotencyKey)
      .where(sql`${t.independentUserId} IS NOT NULL`),
  }),
);

export const learnSessionEvents = pgTable(
  'learn_session_events',
  {
    id: primaryId(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => learnSessions.id, { onDelete: 'cascade' }),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionSeqUq: uniqueIndex('learn_session_events_session_seq_uq').on(t.sessionId, t.seq),
    sessionSeqIdx: index('learn_session_events_session_seq_idx').on(t.sessionId, t.seq),
  }),
);

export const quickAnswers = pgTable(
  'quick_answers',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id),
    studentId: uuid('student_id').references(() => students.id),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id),
    question: text('question').notNull(),
    answerShort: text('answer_short').notNull(),
    answerDetail: text('answer_detail').notNull(),
    visual: jsonb('visual').$type<Record<string, unknown>>(),
    onLearningList: integer('on_learning_list').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerXor: check('quick_answers_owner_ck', ownerXor(t.studentId, t.independentUserId)),
  }),
);

export const revisionStates = pgTable(
  'revision_states',
  {
    id: primaryId(),
    studentId: uuid('student_id').references(() => students.id),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => learnTopics.id),
    freshness: text('freshness').notNull().default('fresh'),
    lastEvidenceAt: timestamp('last_evidence_at', { withTimezone: true }).notNull(),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
    manualDueAt: timestamp('manual_due_at', { withTimezone: true }),
    manualReasons: jsonb('manual_reasons')
      .$type<
        Array<{
          contextType: 'visual_canvas';
          contextId: string;
          nodeId: string;
          title: string;
          reason: 'shaky' | 'memory_missing';
          queuedAt: string;
        }>
      >()
      .notNull()
      .default([]),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerXor: check('revision_states_owner_ck', ownerXor(t.studentId, t.independentUserId)),
    studentTopicUq: uniqueIndex('revision_states_student_topic_uq').on(t.studentId, t.topicId),
    indepTopicUq: uniqueIndex('revision_states_indep_topic_uq').on(t.independentUserId, t.topicId),
  }),
);

export const evidenceTags = pgTable(
  'evidence_tags',
  {
    id: primaryId(),
    studentId: uuid('student_id').references(() => students.id),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id),
    tagKey: text('tag_key').notNull(),
    label: text('label').notNull(),
    polarity: text('polarity').notNull(),
    note: text('note').notNull(),
    evidenceEventIds: jsonb('evidence_event_ids').$type<string[]>().notNull().default([]),
    status: text('status').notNull().default('active'),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerXor: check('evidence_tags_owner_ck', ownerXor(t.studentId, t.independentUserId)),
    studentTagUq: uniqueIndex('evidence_tags_student_tag_uq').on(t.studentId, t.tagKey),
    indepTagUq: uniqueIndex('evidence_tags_indep_tag_uq').on(t.independentUserId, t.tagKey),
  }),
);

export const learnAiCalls = pgTable(
  'learn_ai_calls',
  {
    id: primaryId(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    studentId: uuid('student_id'),
    independentUserId: uuid('independent_user_id'),
    sessionId: uuid('session_id').references(() => learnSessions.id, { onDelete: 'set null' }),
    blockId: uuid('block_id').references(() => learnSessionBlocks.id, { onDelete: 'set null' }),
    blockSeq: integer('block_seq'),
    purpose: text('purpose').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cached: integer('cached').notNull().default(0),
    durationMs: integer('duration_ms'),
    firstTokenMs: integer('first_token_ms'),
    retry: boolean('retry').notNull().default(false),
    speculative: boolean('speculative').notNull().default(false),
    degraded: boolean('degraded').notNull().default(false),
    outcome: text('outcome'),
    error: text('error'),
  },
  (t) => ({
    // Append-only cost ledger: the owner FKs are ON DELETE SET NULL, so an
    // ownerless row is legitimate. Only "both owners set" is forbidden.
    ownerXor: check('learn_ai_calls_owner_ck', ownerAtMostOne(t.studentId, t.independentUserId)),
  }),
);

/**
 * Typed key/value store for the `learn.*` config namespace (hyperspec 3 §2).
 * Resolution order is global -> institution -> independent_user, most specific
 * wins. Plan and campus layers are deliberately not modelled; see migration
 * 0104 for why. An empty table is valid and means "use the code defaults".
 */
export const learnConfig = pgTable(
  'learn_config',
  {
    id: primaryId(),
    key: text('key').notNull(),
    scope: text('scope').$type<'global' | 'institution' | 'independent_user'>().notNull().default('global'),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    valueType: text('value_type').$type<'number' | 'string' | 'boolean'>().notNull(),
    value: text('value').notNull(),
    description: text('description'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    keyCk: check('learn_config_key_ck', sql`${t.key} ~ '^learn\\.[a-z0-9_]+$'`),
    scopeCk: check('learn_config_scope_ck', sql`${t.scope} IN ('global', 'institution', 'independent_user')`),
    valueTypeCk: check(
      'learn_config_value_type_ck',
      sql`${t.valueType} IN ('number', 'string', 'boolean')`,
    ),
    // Phase C tenancy form, made scope-conditional: a global row is ownerless
    // by definition, so the discriminator and the owner columns must agree.
    ownerCk: check(
      'learn_config_owner_ck',
      sql`(${t.scope} = 'global' AND num_nonnulls(${t.institutionId}, ${t.independentUserId}) = 0)
    OR (${t.scope} = 'institution' AND ${t.institutionId} IS NOT NULL AND ${t.independentUserId} IS NULL)
    OR (${t.scope} = 'independent_user' AND ${t.independentUserId} IS NOT NULL AND ${t.institutionId} IS NULL)`,
    ),
    globalKeyUq: uniqueIndex('learn_config_global_key_uq')
      .on(t.key)
      .where(sql`${t.scope} = 'global'`),
    institutionKeyUq: uniqueIndex('learn_config_institution_key_uq')
      .on(t.institutionId, t.key)
      .where(sql`${t.scope} = 'institution'`),
    independentKeyUq: uniqueIndex('learn_config_independent_key_uq')
      .on(t.independentUserId, t.key)
      .where(sql`${t.scope} = 'independent_user'`),
    institutionIdx: index('learn_config_institution_idx')
      .on(t.institutionId)
      .where(sql`${t.institutionId} IS NOT NULL`),
    independentUserIdx: index('learn_config_independent_user_idx')
      .on(t.independentUserId)
      .where(sql`${t.independentUserId} IS NOT NULL`),
  }),
);

export type LearnTopic = typeof learnTopics.$inferSelect;
export type ConceptAtom = typeof conceptAtoms.$inferSelect;
export type LearnTopicProfile = typeof learnTopicProfiles.$inferSelect;
export type LearningPath = typeof learningPaths.$inferSelect;
export type LearningPathItem = typeof learningPathItems.$inferSelect;
export type LearnSession = typeof learnSessions.$inferSelect;
export type LearnSessionBlock = typeof learnSessionBlocks.$inferSelect;
export type LearnAttempt = typeof learnAttempts.$inferSelect;
export type LearnerMastery = typeof learnerMastery.$inferSelect;
export type LearnerModelEvent = typeof learnerModelEvents.$inferSelect;
export type LearnSessionEvent = typeof learnSessionEvents.$inferSelect;
export type QuickAnswer = typeof quickAnswers.$inferSelect;
export type RevisionState = typeof revisionStates.$inferSelect;
export type EvidenceTag = typeof evidenceTags.$inferSelect;
export type LearnAiCall = typeof learnAiCalls.$inferSelect;
export type LearnConfigRow = typeof learnConfig.$inferSelect;
