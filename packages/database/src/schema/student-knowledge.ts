import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
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
import { storageObjects } from './student';
import { learnSessions } from './learn';

/** Durable preparation and dispatch outbox; source content remains in knowledge versions. */
export const knowledgePreparations = pgTable('knowledge_preparations', {
  id: primaryId(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
  materialId: uuid('material_id').notNull(), // Content-free receipt survives material deletion for admission accounting.
  materialVersion: integer('material_version').notNull(),
  objectId: uuid('object_id').notNull(),
  requestedBy: uuid('requested_by').notNull(),
  scope: jsonb('scope').$type<{ mode: 'institution' } | { mode: 'campus'; campusId: string }>().notNull(),
  extractorVersion: text('extractor_version').notNull(),
  state: text('state').notNull().default('queued'),
  version: integer('version').notNull().default(1),
  attempts: integer('attempts').notNull().default(0),
  totalAttempts: integer('total_attempts').notNull().default(0),
  fence: integer('fence').notNull().default(0),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  nextDispatchAt: timestamp('next_dispatch_at', { withTimezone: true }).notNull().defaultNow(),
  dispatchSequence: integer('dispatch_sequence').notNull().default(0),
  pagesDone: integer('pages_done').notNull().default(0),
  errorCode: text('error_code'),
  retryable: boolean('retryable').notNull().default(false),
  ...timestamps,
}, (t) => ({
  publicationUq: uniqueIndex('knowledge_preparations_publication_uq').on(t.materialId, t.materialVersion, t.objectId, t.extractorVersion),
  dueIdx: index('knowledge_preparations_due_idx').on(t.state, t.nextDispatchAt),
  institutionIdx: index('knowledge_preparations_institution_idx').on(t.institutionId, t.createdAt),
}));

export type LibraryQuizPatterns = {
  per_question: Array<{
    question_id: string;
    topic: string;
    type: string;
    correct: boolean;
    chosen: string | null;
    time_ms: number;
  }>;
  per_topic: Record<string, { asked: number; correct: number }>;
  difficulty: number;
  source_knowledge_item_id: string | null;
};

export const knowledgeCollections = pgTable(
  'knowledge_collections',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    color: text('color'),
    sequence: integer('sequence').notNull().default(0),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    studentIdx: index('knowledge_collections_student_idx').on(t.studentId),
    indepIdx: index('knowledge_collections_indep_idx').on(t.independentUserId),
  }),
);

export const knowledgeItems = pgTable(
  'knowledge_items',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    collectionId: uuid('collection_id').references(() => knowledgeCollections.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    objectIds: jsonb('object_ids').$type<string[]>().notNull().default([]),
    origin: jsonb('origin').$type<Record<string, unknown>>().notNull().default({}),
    pageCount: integer('page_count'),
    extractedTextReady: boolean('extracted_text_ready').notNull().default(false),
    aiRead: boolean('ai_read').notNull().default(false),
    /** queued | reading | needs_ocr_confirm | ready | error */
    status: text('status').notNull().default('ready'),
    pagesDone: integer('pages_done').notNull().default(0),
    errorMessage: text('error_message'),
    /** claimed | loading_files | extracting | ocr | writing_pages | finalizing */
    ingestStage: text('ingest_stage'),
    ingestHeartbeatAt: timestamp('ingest_heartbeat_at', { withTimezone: true }),
    ingestAttempts: integer('ingest_attempts').notNull().default(0),
    ingestErrorDetail: text('ingest_error_detail'),
    indexReady: boolean('index_ready').notNull().default(false),
    sourceRevokedAt: timestamp('source_revoked_at', { withTimezone: true }),
    embeddingModel: text('embedding_model'),
    embeddingDimension: integer('embedding_dimension'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    ownerIdx: index('knowledge_items_owner_idx').on(t.studentId, t.createdAt),
    ownerIndepIdx: index('knowledge_items_owner_i_idx').on(t.independentUserId, t.createdAt),
  }),
);

export const knowledgeItemPages = pgTable(
  'knowledge_item_pages',
  {
    id: primaryId(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: 'cascade' }),
    pageIndex: integer('page_index').notNull(),
    objectId: uuid('object_id')
      .notNull()
      .references(() => storageObjects.id, { onDelete: 'cascade' }),
    text: text('text').notNull().default(''),
    /** null = digital extract (no OCR); otherwise 0–1 confidence */
    ocrConfidence: numeric('ocr_confidence', { precision: 4, scale: 3 }),
    needsConfirm: boolean('needs_confirm').notNull().default(false),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    itemPageUq: uniqueIndex('knowledge_item_pages_item_page_uq').on(t.itemId, t.pageIndex),
    itemIdx: index('knowledge_item_pages_item_idx').on(t.itemId),
  }),
);

/** Content-free deletion receipt: publication retries must not recreate a removed owner. */
export const knowledgeItemTombstones = pgTable('knowledge_item_tombstones', {
  itemId: uuid('item_id').primaryKey(),
  institutionId: uuid('institution_id').notNull(),
  studentId: uuid('student_id').notNull(),
  materialId: text('material_id').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ ownerMaterialIdx: index('knowledge_item_tombstones_owner_material_idx').on(t.institutionId, t.studentId, t.materialId) }));

/** Immutable extraction history owned by the existing knowledge item. No legacy backfill. */
export const knowledgeItemVersions = pgTable(
  'knowledge_item_versions',
  {
    id: primaryId(),
    itemId: uuid('item_id').notNull().references(() => knowledgeItems.id, { onDelete: 'cascade' }),
    fingerprint: text('fingerprint').notNull(),
    ordinal: integer('ordinal').notNull(),
    objectId: uuid('object_id').notNull(), // Retained on original deletion; reads require the live object.
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    pageCount: integer('page_count').notNull(),
    admissible: boolean('admissible').notNull(),
    state: text('state').notNull().default('building'),
    invalidatedAt: timestamp('invalidated_at', { withTimezone: true }),
    invalidationReason: text('invalidation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fingerprintUq: uniqueIndex('knowledge_item_versions_fingerprint_uq').on(t.itemId, t.fingerprint),
    itemIdx: index('knowledge_item_versions_item_idx').on(t.itemId, t.createdAt),
  }),
);

export const knowledgeItemVersionPages = pgTable(
  'knowledge_item_version_pages',
  {
    id: primaryId(),
    versionId: uuid('version_id').notNull().references(() => knowledgeItemVersions.id, { onDelete: 'cascade' }),
    pageIndex: integer('page_index').notNull(),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pageUq: uniqueIndex('knowledge_item_version_pages_page_uq').on(t.versionId, t.pageIndex),
  }),
);

export const knowledgeArtifacts = pgTable(
  'knowledge_artifacts',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    itemId: uuid('item_id').references(() => knowledgeItems.id, { onDelete: 'cascade' }),
    sourceSessionId: uuid('source_session_id').references(() => learnSessions.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    content: jsonb('content').$type<Record<string, unknown>>().notNull(),
    topicId: uuid('topic_id'),
    fromLabel: text('from_label').notNull(),
    lastInteractedAt: timestamp('last_interacted_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    itemIdx: index('knowledge_artifacts_item_idx').on(t.itemId),
    ownerIdx: index('knowledge_artifacts_owner_idx').on(t.studentId, t.createdAt),
  }),
);

export const flashcardDecks = pgTable(
  'flashcard_decks',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    itemId: uuid('item_id').references(() => knowledgeItems.id, { onDelete: 'set null' }),
    sourceSessionId: uuid('source_session_id').references(() => learnSessions.id, { onDelete: 'set null' }),
    topicId: uuid('topic_id'),
    title: text('title').notNull(),
    fromLabel: text('from_label').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    subjectRef: jsonb('subject_ref').$type<{
      kind: 'erp_subject' | 'commitment' | 'self';
      id?: string;
      label?: string;
    } | null>(),
    examBoostOptOut: boolean('exam_boost_opt_out').notNull().default(false),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    ownerIdx: index('flashcard_decks_owner_idx').on(t.studentId, t.createdAt),
  }),
);

export const flashcards = pgTable(
  'flashcards',
  {
    id: primaryId(),
    deckId: uuid('deck_id')
      .notNull()
      .references(() => flashcardDecks.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    prompt: text('prompt').notNull(),
    answer: text('answer').notNull(),
    nextDueAt: timestamp('next_due_at', { withTimezone: true }).notNull().defaultNow(),
    intervalDays: numeric('interval_days', { precision: 6, scale: 2 }).notNull().default('0'),
    ease: numeric('ease', { precision: 4, scale: 2 }).notNull().default('2.50'),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    sourcePage: integer('source_page'),
    /** new | learning | review | relearning */
    srsState: text('srs_state'),
    stability: real('stability'),
    difficulty: real('difficulty'),
    fsrsDueAt: timestamp('fsrs_due_at', { withTimezone: true }),
    lastReviewAt: timestamp('last_review_at', { withTimezone: true }),
    /** sm2 until backfill completes; fsrs after */
    scheduler: text('scheduler').notNull().default('sm2'),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    fsrsParamsVersion: integer('fsrs_params_version').notNull().default(1),
    sourceRef: jsonb('source_ref').$type<{ knowledge_item_id: string; page: number } | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    deckSeqUq: uniqueIndex('flashcards_deck_seq_uq').on(t.deckId, t.sequence),
    fsrsDueIdx: index('flashcards_fsrs_due_at_idx').on(t.fsrsDueAt),
    duePredicateIdx: index('flashcards_due_predicate_idx')
      .on(t.fsrsDueAt)
      .where(sql`${t.suspendedAt} is null`),
  }),
);

export const libraryQuizAttempts = pgTable(
  'library_quiz_attempts',
  {
    id: primaryId(),
    artifactId: uuid('artifact_id')
      .notNull()
      .references(() => knowledgeArtifacts.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    answers: jsonb('answers').$type<Record<string, unknown>[]>().notNull().default([]),
    results: jsonb('results').$type<Record<string, unknown>[]>().notNull().default([]),
    patterns: jsonb('patterns').$type<LibraryQuizPatterns>().notNull().default({
      per_question: [],
      per_topic: {},
      difficulty: 1,
      source_knowledge_item_id: null,
    }),
    finishedAt: timestamp('finished_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    artifactIdx: index('library_quiz_attempts_artifact_idx').on(t.artifactId, t.finishedAt),
    ownerIdx: index('library_quiz_attempts_owner_idx').on(t.studentId, t.finishedAt),
  }),
);

export const flashcardReviews = pgTable(
  'flashcard_reviews',
  {
    id: primaryId(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => flashcards.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    result: text('result').notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
    grade: text('grade'),
    stateBefore: text('state_before'),
    stateAfter: text('state_after'),
    dueBefore: timestamp('due_before', { withTimezone: true }),
    dueAfter: timestamp('due_after', { withTimezone: true }),
    elapsedMs: integer('elapsed_ms'),
    sessionId: uuid('session_id'),
    clientReviewId: uuid('client_review_id'),
  },
  (t) => ({
    cardIdx: index('flashcard_reviews_card_idx').on(t.cardId, t.reviewedAt),
    studentClientIdem: uniqueIndex('flashcard_reviews_student_client_uq')
      .on(t.studentId, t.clientReviewId)
      .where(sql`${t.studentId} is not null and ${t.clientReviewId} is not null`),
    indepClientIdem: uniqueIndex('flashcard_reviews_indep_client_uq')
      .on(t.independentUserId, t.clientReviewId)
      .where(sql`${t.independentUserId} is not null and ${t.clientReviewId} is not null`),
  }),
);

/** Curriculum paper-pattern presets (CBSE / KTU / chapter test). */
export const examPaperPatterns = pgTable(
  'exam_paper_patterns',
  {
    id: primaryId(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    board: text('board').notNull(),
    levelLabel: text('level_label').notNull(),
    durationMin: integer('duration_min').notNull(),
    totalMarks: integer('total_marks').notNull(),
    sections: jsonb('sections').$type<Record<string, unknown>[]>().notNull(),
    description: text('description'),
    ...timestamps,
  },
  (t) => ({
    keyUq: uniqueIndex('exam_paper_patterns_key_uq').on(t.key),
  }),
);

/** Editable blueprint persisted before generation; retakes reuse the same row. */
export const examBlueprints = pgTable(
  'exam_blueprints',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    paperPatternId: uuid('paper_pattern_id').references(() => examPaperPatterns.id, {
      onDelete: 'set null',
    }),
    sourceKind: text('source_kind').notNull().default('studied'),
    blueprint: jsonb('blueprint').$type<Record<string, unknown>>().notNull(),
    version: integer('version').notNull().default(1),
    skin: text('skin').notNull().default('standard'),
    gradingStyle: text('grading_style').notNull().default('auto'),
    /** Tier 3 Entrance Prep hook — validated slug; FK deferred until exam_profiles exists. */
    examProfileKey: text('exam_profile_key'),
    isPublished: boolean('is_published').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    ownerIdx: index('exam_blueprints_owner_idx').on(t.studentId, t.createdAt),
    indepIdx: index('exam_blueprints_indep_idx').on(t.independentUserId, t.createdAt),
    institutionPubIdx: index('exam_blueprints_institution_pub_idx').on(t.institutionId, t.isPublished),
    profileKeyIdx: index('exam_blueprints_profile_key_idx').on(t.examProfileKey),
  }),
);

/** Shared validated question bank (concept_atoms-style cache). */
export const questionBank = pgTable(
  'question_bank',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id'),
    topicKey: text('topic_key').notNull(),
    topicLabel: text('topic_label').notNull(),
    qtype: text('qtype').notNull(),
    difficulty: text('difficulty').notNull(),
    difficultyDeclared: text('difficulty_declared'),
    curriculumKey: text('curriculum_key').notNull().default('general'),
    promptHash: text('prompt_hash').notNull(),
    promptVersion: text('prompt_version').notNull().default('exam-v1'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    model: text('model'),
    source: text('source').notNull().default('system'),
    reviewStatus: text('review_status').notNull().default('approved'),
    topicTags: text('topic_tags').array().notNull().default([]),
    duplicateOfId: uuid('duplicate_of_id'),
    reviewNote: text('review_note'),
    createdByStaffId: uuid('created_by_staff_id'),
    reviewedByStaffId: uuid('reviewed_by_staff_id'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    bankVersion: integer('bank_version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    bankUq: uniqueIndex('question_bank_lookup_uq').on(
      t.topicKey,
      t.qtype,
      t.difficulty,
      t.curriculumKey,
      t.promptHash,
      t.promptVersion,
    ),
    topicIdx: index('question_bank_topic_idx').on(t.topicKey, t.qtype, t.difficulty),
    institutionReviewIdx: index('question_bank_institution_review_idx').on(
      t.institutionId,
      t.reviewStatus,
      t.qtype,
      t.difficulty,
    ),
    subjectIdx: index('question_bank_subject_idx').on(t.subjectId, t.reviewStatus),
  }),
);

/** Per-student exposure so banked questions are not repeated. */
export const questionExposure = pgTable(
  'question_exposure',
  {
    id: primaryId(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    questionBankId: uuid('question_bank_id')
      .notNull()
      .references(() => questionBank.id, { onDelete: 'cascade' }),
    exposedAt: timestamp('exposed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    studentBankUq: uniqueIndex('question_exposure_student_bank_uq').on(t.studentId, t.questionBankId),
    indepBankUq: uniqueIndex('question_exposure_indep_bank_uq').on(
      t.independentUserId,
      t.questionBankId,
    ),
  }),
);

export const mockExams = pgTable(
  'mock_exams',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    title: text('title').notNull(),
    subjectLabel: text('subject_label').notNull(),
    topics: jsonb('topics').$type<string[]>().notNull(),
    context: jsonb('context').$type<Record<string, unknown>>().notNull(),
    referenceObjectId: uuid('reference_object_id').references(() => storageObjects.id, {
      onDelete: 'set null',
    }),
    examGoalId: uuid('exam_goal_id'),
    blueprintId: uuid('blueprint_id').references(() => examBlueprints.id, { onDelete: 'set null' }),
    sourceKind: text('source_kind'),
    generationNotice: text('generation_notice'),
    gradingStatus: text('grading_status'),
    examProfileKey: text('exam_profile_key'),
    scope: jsonb('scope').$type<Record<string, unknown>>().notNull().default({}),
    difficulty: text('difficulty'),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    strictMode: boolean('strict_mode').notNull().default(false),
    blueprintSnapshot: jsonb('blueprint_snapshot').$type<Record<string, unknown> | null>(),
    blueprintVersion: integer('blueprint_version'),
    generationMeta: jsonb('generation_meta').$type<Record<string, unknown>>().notNull().default({}),
    obligationId: uuid('obligation_id'),
    status: text('status').notNull().default('draft'),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    ownerIdx: index('mock_exams_owner_idx').on(t.studentId, t.createdAt),
    blueprintIdx: index('mock_exams_blueprint_idx').on(t.blueprintId),
    scheduledIdx: index('mock_exams_scheduled_idx').on(t.scheduledFor),
    statusIdx: index('mock_exams_status_idx').on(t.status, t.createdAt),
  }),
);

export const mockExamQuestions = pgTable(
  'mock_exam_questions',
  {
    id: primaryId(),
    mockExamId: uuid('mock_exam_id')
      .notNull()
      .references(() => mockExams.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    topic: text('topic').notNull(),
    qtype: text('qtype').notNull(),
    prompt: text('prompt').notNull(),
    options: jsonb('options').$type<{ key: string; label: string }[] | null>(),
    correctKey: text('correct_key'),
    markingNote: text('marking_note'),
    marks: integer('marks').notNull().default(1),
    sectionId: text('section_id'),
    difficulty: text('difficulty'),
    payload: jsonb('payload').$type<Record<string, unknown> | null>(),
    questionBankId: uuid('question_bank_id').references(() => questionBank.id, {
      onDelete: 'set null',
    }),
    source: text('source'),
    validatorMeta: jsonb('validator_meta').$type<Record<string, unknown> | null>(),
    snapshotHash: text('snapshot_hash'),
  },
  (t) => ({
    examSeqUq: uniqueIndex('mock_exam_questions_exam_seq_uq').on(t.mockExamId, t.sequence),
    bankIdx: index('mock_exam_questions_bank_idx').on(t.questionBankId),
  }),
);

export const mockExamAttempts = pgTable(
  'mock_exam_attempts',
  {
    id: primaryId(),
    mockExamId: uuid('mock_exam_id')
      .notNull()
      .references(() => mockExams.id, { onDelete: 'cascade' }),
    attemptNo: integer('attempt_no').notNull().default(1),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    status: text('status').notNull().default('in_progress'),
    serverClockSkewMs: integer('server_clock_skew_ms'),
    results: jsonb('results').$type<Record<string, unknown> | null>(),
    tabSwitches: integer('tab_switches').notNull().default(0),
    strictModeSnapshot: boolean('strict_mode_snapshot'),
    currentSectionId: text('current_section_id'),
    sectionDeadlines: jsonb('section_deadlines').$type<Record<string, string> | null>(),
    scoringVersion: text('scoring_version'),
  },
  (t) => ({
    examAttemptUq: uniqueIndex('mock_exam_attempts_exam_no_uq').on(t.mockExamId, t.attemptNo),
    statusIdx: index('mock_exam_attempts_status_idx').on(t.status, t.endsAt),
  }),
);

export const mockExamAnswers = pgTable(
  'mock_exam_answers',
  {
    id: primaryId(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => mockExamAttempts.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => mockExamQuestions.id, { onDelete: 'cascade' }),
    choiceKey: text('choice_key'),
    answerText: text('answer_text'),
    photoObjectId: uuid('photo_object_id').references(() => storageObjects.id, { onDelete: 'set null' }),
    flagged: boolean('flagged').notNull().default(false),
    answerPayload: jsonb('answer_payload').$type<Record<string, unknown> | null>(),
    clientUpdatedAt: timestamp('client_updated_at', { withTimezone: true }),
    evaluation: jsonb('evaluation').$type<Record<string, unknown> | null>(),
    state: text('state').notNull().default('unseen'),
    timeSpentMs: integer('time_spent_ms').notNull().default(0),
    answerMode: text('answer_mode'),
    photoRefs: jsonb('photo_refs').$type<string[] | null>(),
    answerSchemaVersion: integer('answer_schema_version').notNull().default(1),
    evaluationSchemaVersion: integer('evaluation_schema_version'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    attemptQUq: uniqueIndex('mock_exam_answers_attempt_q_uq').on(t.attemptId, t.questionId),
  }),
);

export const debates = pgTable(
  'debates',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    motion: text('motion').notNull(),
    side: text('side').notNull(),
    format: text('format').notNull(),
    mode: text('mode').notNull(),
    inviteTokenHash: text('invite_token_hash'),
    stage: text('stage').notNull().default('setup'),
    turnSeconds: integer('turn_seconds').notNull().default(180),
    feedback: jsonb('feedback').$type<Record<string, unknown> | null>(),
    audioSeam: jsonb('audio_seam').$type<Record<string, unknown> | null>(),
    formatKey: text('format_key'),
    formatVersion: integer('format_version'),
    motionId: uuid('motion_id'),
    motionText: text('motion_text'),
    motionInfoSlide: text('motion_info_slide'),
    prepSeconds: integer('prep_seconds'),
    scaffoldsEnabled: boolean('scaffolds_enabled'),
    aiOpponentDifficulty: text('ai_opponent_difficulty'),
    status: text('status').default('draft'),
    consentPolicyVersion: text('consent_policy_version'),
    retentionPolicy: jsonb('retention_policy').$type<Record<string, unknown> | null>(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    currentTurnIndex: integer('current_turn_index').default(0),
    scoreConfidence: text('score_confidence'),
    audioExpiredAt: timestamp('audio_expired_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    ownerIdx: index('debates_owner_idx').on(t.studentId, t.createdAt),
  }),
);

export const debateParticipants = pgTable(
  'debate_participants',
  {
    id: primaryId(),
    debateId: uuid('debate_id')
      .notNull()
      .references(() => debates.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    displayName: text('display_name').notNull(),
    side: text('side'),
    seatKey: text('seat_key'),
    participantKind: text('participant_kind'),
    aiPersonaKey: text('ai_persona_key'),
    ttsVoiceKey: text('tts_voice_key'),
    consentId: uuid('consent_id'),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    leftAt: timestamp('left_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
  },
  (t) => ({
    debateIdx: index('debate_participants_debate_idx').on(t.debateId),
  }),
);

export const debateTurns = pgTable(
  'debate_turns',
  {
    id: primaryId(),
    debateId: uuid('debate_id')
      .notNull()
      .references(() => debates.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    round: text('round').notNull(),
    speakerRole: text('speaker_role').notNull(),
    text: text('text'),
    turnIndex: integer('turn_index'),
    seatKey: text('seat_key'),
    speechKind: text('speech_kind'),
    plannedDurationMs: integer('planned_duration_ms'),
    actualDurationMs: integer('actual_duration_ms'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }),
    overtimeMs: integer('overtime_ms').default(0),
    textContent: text('text_content'),
    captureState: text('capture_state'),
    sttState: text('stt_state'),
    transcriptId: uuid('transcript_id'),
    audioSeam: jsonb('audio_seam').$type<Record<string, unknown> | null>(),
    audioObjectId: uuid('audio_object_id').references(() => storageObjects.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    debateSeqUq: uniqueIndex('debate_turns_debate_seq_uq').on(t.debateId, t.sequence),
  }),
);

export const achievementAwards = pgTable(
  'achievement_awards',
  {
    id: primaryId(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    badgeKey: text('badge_key').notNull(),
    tier: text('tier').notNull().default('bronze'),
    evidenceNote: text('evidence_note').notNull(),
    evidenceEventIds: jsonb('evidence_event_ids').$type<string[]>().notNull().default([]),
    awardedAt: timestamp('awarded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    studentBadgeUq: uniqueIndex('achievement_awards_student_badge_uq').on(t.studentId, t.badgeKey, t.tier),
    indepBadgeUq: uniqueIndex('achievement_awards_indep_badge_uq').on(
      t.independentUserId,
      t.badgeKey,
      t.tier,
    ),
  }),
);
