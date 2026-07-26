import { bigint, boolean, check, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { students } from './people';
import { independentUsers } from './users';

const personalOwnerXor = (studentId: unknown, independentUserId: unknown) =>
  sql`num_nonnulls(${studentId}, ${independentUserId}) = 1`;

export const learnEntryPoints = [
  'learning_path',
  'free_chat_handoff',
  'library_document',
  'review_queue',
  'goal',
  'prep_countdown',
  'bad_result',
  'upcoming_exam',
] as const;

export const learnOrchestratorStatuses = [
  'created',
  'active',
  'awaiting_response',
  'paused',
  'closing',
  'closed',
] as const;

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

export const learningPaths = pgTable('learning_paths', {
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
});

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
    pathItemId: uuid('path_item_id').references(() => learningPathItems.id),
    groundingKnowledgeItemId: uuid('grounding_knowledge_item_id'),
    status: text('status').notNull().default('active'),
    spine: jsonb('spine').$type<unknown[]>().notNull(),
    sessionPlan: jsonb('session_plan').$type<Record<string, unknown>>().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    evidence: jsonb('evidence').$type<string[]>().notNull().default([]),
    version: integer('version').notNull().default(1),
    entryPoint: text('entry_point'),
    orchestratorStatus: text('orchestrator_status'),
    state: jsonb('state').$type<Record<string, unknown>>().notNull().default({}),
    sessionContext: jsonb('session_context').$type<Record<string, unknown>>().notNull().default({}),
    policySnapshot: jsonb('policy_snapshot').$type<Record<string, unknown>>().notNull().default({}),
    timeBudgetMinutes: integer('time_budget_minutes'),
    elapsedMinutes: integer('elapsed_minutes').notNull().default(0),
    checkpointsTotal: integer('checkpoints_total').notNull().default(0),
    checkpointsDone: integer('checkpoints_done').notNull().default(0),
    planMoveCount: integer('plan_move_count').notNull().default(0),
    endReason: text('end_reason'),
    activeKey: text('active_key'),
    lastEventSeq: bigint('last_event_seq', { mode: 'number' }).notNull().default(0),
    orchestratorUpdatedAt: timestamp('orchestrator_updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    studentIdx: index('learn_sessions_student_idx').on(t.studentId, t.startedAt),
    indepIdx: index('learn_sessions_indep_idx').on(t.independentUserId, t.startedAt),
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
    spineStep: text('spine_step').notNull(),
    content: jsonb('content').$type<Record<string, unknown>>().notNull(),
    state: jsonb('state').$type<Record<string, unknown>>().notNull().default({}),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    moveType: text('move_type'),
    blockSchemaVersion: integer('block_schema_version').notNull().default(1),
    reasoning: jsonb('reasoning').$type<Record<string, unknown>>(),
    degraded: boolean('degraded').notNull().default(false),
    interactionState: jsonb('interaction_state').$type<Record<string, unknown>>().notNull().default({}),
    streamSeq: bigint('stream_seq', { mode: 'number' }),
    renderStatus: text('render_status'),
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

export const learnAttempts = pgTable('learn_attempts', {
  id: primaryId(),
  sessionId: uuid('session_id').references(() => learnSessions.id, { onDelete: 'set null' }),
  blockId: uuid('block_id').references(() => learnSessionBlocks.id, { onDelete: 'set null' }),
  studentId: uuid('student_id').references(() => students.id),
  independentUserId: uuid('independent_user_id').references(() => independentUsers.id),
  kind: text('kind').notNull(),
  input: jsonb('input').$type<Record<string, unknown>>().notNull(),
  evaluation: jsonb('evaluation').$type<Record<string, unknown>>().notNull(),
  hintsUsed: integer('hints_used').notNull().default(0),
  questionId: text('question_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const learnTopicProfiles = pgTable(
  'learn_topic_profiles',
  {
    id: primaryId(),
    learnTopicId: uuid('learn_topic_id').references(() => learnTopics.id, { onDelete: 'cascade' }),
    topicKey: text('topic_key'),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    profile: jsonb('profile').$type<Record<string, unknown>>().notNull().default({}),
    source: text('source').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    ...timestamps,
    version: integer('version').notNull().default(1),
  },
  (t) => ({
    instTopicUq: uniqueIndex('learn_topic_profiles_inst_topic_uq')
      .on(t.institutionId, t.learnTopicId)
      .where(sql`${t.institutionId} IS NOT NULL AND ${t.learnTopicId} IS NOT NULL`),
    instTopicKeyUq: uniqueIndex('learn_topic_profiles_inst_topic_key_uq')
      .on(t.institutionId, t.topicKey)
      .where(
        sql`${t.institutionId} IS NOT NULL AND ${t.learnTopicId} IS NULL AND ${t.topicKey} IS NOT NULL`,
      ),
    indepTopicUq: uniqueIndex('learn_topic_profiles_indep_topic_uq')
      .on(t.independentUserId, t.learnTopicId)
      .where(sql`${t.independentUserId} IS NOT NULL AND ${t.learnTopicId} IS NOT NULL`),
    indepTopicKeyUq: uniqueIndex('learn_topic_profiles_indep_topic_key_uq')
      .on(t.independentUserId, t.topicKey)
      .where(
        sql`${t.independentUserId} IS NOT NULL AND ${t.learnTopicId} IS NULL AND ${t.topicKey} IS NOT NULL`,
      ),
    globalTopicKeyUq: uniqueIndex('learn_topic_profiles_global_topic_key_uq')
      .on(t.topicKey)
      .where(
        sql`${t.institutionId} IS NULL AND ${t.independentUserId} IS NULL AND ${t.topicKey} IS NOT NULL`,
      ),
  }),
);

export const learnerMastery = pgTable(
  'learner_mastery',
  {
    id: primaryId(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    atomId: uuid('atom_id')
      .notNull()
      .references(() => conceptAtoms.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull().default(800),
    attempts: integer('attempts').notNull().default(0),
    correctWeight: numeric('correct_weight').notNull().default('0'),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    ...timestamps,
    version: integer('version').notNull().default(1),
  },
  (t) => ({
    ownerXor: check('learner_mastery_owner_xor', personalOwnerXor(t.studentId, t.independentUserId)),
    studentAtomUq: uniqueIndex('learner_mastery_student_atom_uq')
      .on(t.studentId, t.atomId)
      .where(sql`${t.studentId} IS NOT NULL`),
    indepAtomUq: uniqueIndex('learner_mastery_indep_atom_uq')
      .on(t.independentUserId, t.atomId)
      .where(sql`${t.independentUserId} IS NOT NULL`),
  }),
);

export const learnerModelEvents = pgTable(
  'learner_model_events',
  {
    id: primaryId(),
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
  },
  (t) => ({
    ownerXor: check('learner_model_events_owner_xor', personalOwnerXor(t.studentId, t.independentUserId)),
    studentIdemUq: uniqueIndex('learner_model_events_student_idem_uq')
      .on(t.studentId, t.idempotencyKey)
      .where(sql`${t.studentId} IS NOT NULL`),
    indepIdemUq: uniqueIndex('learner_model_events_indep_idem_uq')
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

export const quickAnswers = pgTable('quick_answers', {
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
});

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
    studentTagUq: uniqueIndex('evidence_tags_student_tag_uq').on(t.studentId, t.tagKey),
    indepTagUq: uniqueIndex('evidence_tags_indep_tag_uq').on(t.independentUserId, t.tagKey),
  }),
);

export const learnAiCalls = pgTable('learn_ai_calls', {
  id: primaryId(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  studentId: uuid('student_id'),
  independentUserId: uuid('independent_user_id'),
  purpose: text('purpose').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cached: integer('cached').notNull().default(0),
  durationMs: integer('duration_ms'),
  error: text('error'),
  sessionId: uuid('session_id').references(() => learnSessions.id, { onDelete: 'set null' }),
  blockId: uuid('block_id').references(() => learnSessionBlocks.id, { onDelete: 'set null' }),
  blockSeq: integer('block_seq'),
  promptVersion: text('prompt_version'),
  retry: boolean('retry').notNull().default(false),
  speculative: boolean('speculative').notNull().default(false),
  degraded: boolean('degraded').notNull().default(false),
  outcome: text('outcome'),
  firstTokenMs: integer('first_token_ms'),
});

export type LearnTopic = typeof learnTopics.$inferSelect;
export type ConceptAtom = typeof conceptAtoms.$inferSelect;
export type LearningPath = typeof learningPaths.$inferSelect;
export type LearningPathItem = typeof learningPathItems.$inferSelect;
export type LearnSession = typeof learnSessions.$inferSelect;
export type LearnSessionBlock = typeof learnSessionBlocks.$inferSelect;
export type LearnAttempt = typeof learnAttempts.$inferSelect;
export type QuickAnswer = typeof quickAnswers.$inferSelect;
export type RevisionState = typeof revisionStates.$inferSelect;
export type EvidenceTag = typeof evidenceTags.$inferSelect;
export type LearnAiCall = typeof learnAiCalls.$inferSelect;
export type LearnTopicProfile = typeof learnTopicProfiles.$inferSelect;
export type LearnerMastery = typeof learnerMastery.$inferSelect;
export type LearnerModelEvent = typeof learnerModelEvents.$inferSelect;
export type LearnSessionEvent = typeof learnSessionEvents.$inferSelect;
