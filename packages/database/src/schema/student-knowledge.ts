import {
  boolean,
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
import { primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { students } from './people';
import { independentUsers } from './users';
import { storageObjects } from './student';
import { learnSessions } from './learn';

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
  },
  (t) => ({
    deckSeqUq: uniqueIndex('flashcards_deck_seq_uq').on(t.deckId, t.sequence),
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
    patterns: jsonb('patterns').$type<string[]>().notNull().default([]),
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
  },
  (t) => ({
    cardIdx: index('flashcard_reviews_card_idx').on(t.cardId, t.reviewedAt),
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
    ...timestamps,
  },
  (t) => ({
    ownerIdx: index('exam_blueprints_owner_idx').on(t.studentId, t.createdAt),
    indepIdx: index('exam_blueprints_indep_idx').on(t.independentUserId, t.createdAt),
  }),
);

/** Shared validated question bank (concept_atoms-style cache). */
export const questionBank = pgTable(
  'question_bank',
  {
    id: primaryId(),
    topicKey: text('topic_key').notNull(),
    topicLabel: text('topic_label').notNull(),
    qtype: text('qtype').notNull(),
    difficulty: text('difficulty').notNull(),
    curriculumKey: text('curriculum_key').notNull().default('general'),
    promptHash: text('prompt_hash').notNull(),
    promptVersion: text('prompt_version').notNull().default('exam-v1'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    model: text('model'),
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
    status: text('status').notNull().default('draft'),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    ownerIdx: index('mock_exams_owner_idx').on(t.studentId, t.createdAt),
    blueprintIdx: index('mock_exams_blueprint_idx').on(t.blueprintId),
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
  },
  (t) => ({
    examSeqUq: uniqueIndex('mock_exam_questions_exam_seq_uq').on(t.mockExamId, t.sequence),
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
    status: text('status').notNull().default('in_progress'),
    serverClockSkewMs: integer('server_clock_skew_ms'),
    results: jsonb('results').$type<Record<string, unknown> | null>(),
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
    text: text('text').notNull(),
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
