import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
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
import { debates, debateParticipants, debateTurns } from './student-knowledge';

export const debateFormats = pgTable(
  'debate_formats',
  {
    id: primaryId(),
    key: text('key').notNull(),
    version: integer('version').notNull(),
    origin: text('origin').notNull(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    shortName: text('short_name').notNull(),
    spec: jsonb('spec').$type<Record<string, unknown>>().notNull().default({}),
    adjudicationTemplateKey: text('adjudication_template_key').notNull().default('two_side_winner'),
    scoreScale: jsonb('score_scale').$type<Record<string, unknown>>().notNull().default({}),
    calibrationState: jsonb('calibration_state').$type<Record<string, unknown>>().notNull().default({
      confidence: 'beta',
    }),
    isBuildable: boolean('is_buildable').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    keyVersionUq: uniqueIndex('debate_formats_key_version_uq').on(t.key, t.version),
  }),
);

export const debateMotions = pgTable(
  'debate_motions',
  {
    id: primaryId(),
    origin: text('origin').notNull(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    text: text('text').notNull(),
    infoSlide: text('info_slide'),
    themes: text('themes').array().notNull().default([]),
    difficulty: integer('difficulty').notNull().default(3),
    formatHints: text('format_hints').array().notNull().default([]),
    source: text('source'),
    isRetired: boolean('is_retired').notNull().default(false),
    usageCount: integer('usage_count').notNull().default(0),
    nsfwFlags: jsonb('nsfw_flags').$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => ({
    themesGin: index('debate_motions_themes_gin').using('gin', t.themes),
  }),
);

export const debateConsents = pgTable('debate_consents', {
  id: primaryId(),
  debateId: uuid('debate_id')
    .notNull()
    .references(() => debates.id, { onDelete: 'cascade' }),
  participantId: uuid('participant_id')
    .notNull()
    .references(() => debateParticipants.id, { onDelete: 'cascade' }),
  institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'set null' }),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
  independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
    onDelete: 'cascade',
  }),
  policyVersion: text('policy_version').notNull(),
  scopes: jsonb('scopes').$type<Record<string, boolean>>().notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  method: text('method').notNull().default('explicit_checkboxes'),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
  guardianConsentId: uuid('guardian_consent_id'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const debateTranscripts = pgTable(
  'debate_transcripts',
  {
    id: primaryId(),
    debateId: uuid('debate_id')
      .notNull()
      .references(() => debates.id, { onDelete: 'cascade' }),
    turnId: uuid('turn_id')
      .notNull()
      .references(() => debateTurns.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    provider: text('provider').notNull(),
    providerModel: text('provider_model').notNull(),
    language: text('language').notNull().default('en-IN'),
    text: text('text').notNull(),
    words: jsonb('words').$type<unknown[]>().notNull().default([]),
    durationMs: integer('duration_ms').notNull().default(0),
    meanConfidence: numeric('mean_confidence'),
    lowConfSpans: jsonb('low_conf_spans').$type<unknown[]>().notNull().default([]),
    metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
    displayText: text('display_text'),
    displayVersion: integer('display_version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    turnUq: uniqueIndex('debate_transcripts_turn_uq').on(t.turnId),
    subjectCk: check(
      'debate_transcripts_subject_ck',
      sql`
      (${t.studentId} IS NOT NULL AND ${t.independentUserId} IS NULL)
      OR (${t.studentId} IS NULL AND ${t.independentUserId} IS NOT NULL)
    `,
    ),
  }),
);

export const debateAdjudicationRuns = pgTable(
  'debate_adjudication_runs',
  {
    id: primaryId(),
    debateId: uuid('debate_id')
      .notNull()
      .references(() => debates.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    runTrigger: text('run_trigger').notNull().default('auto'),
    pipelineVersion: text('pipeline_version').notNull(),
    status: text('status').notNull().default('queued'),
    stageStates: jsonb('stage_states').$type<Record<string, unknown>>().notNull().default({}),
    totalCostMicros: integer('total_cost_micros').notNull().default(0),
    totalLatencyMs: integer('total_latency_ms').notNull().default(0),
    error: jsonb('error').$type<Record<string, unknown> | null>(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    subjectCk: check(
      'debate_adjudication_runs_subject_ck',
      sql`
      (${t.studentId} IS NOT NULL AND ${t.independentUserId} IS NULL)
      OR (${t.studentId} IS NULL AND ${t.independentUserId} IS NOT NULL)
    `,
    ),
  }),
);

export const debateAdjudicationCalls = pgTable('debate_adjudication_calls', {
  id: primaryId(),
  runId: uuid('run_id')
    .notNull()
    .references(() => debateAdjudicationRuns.id, { onDelete: 'cascade' }),
  stage: text('stage').notNull(),
  subjectTurnId: uuid('subject_turn_id').references(() => debateTurns.id, { onDelete: 'set null' }),
  promptTemplateKey: text('prompt_template_key').notNull(),
  promptTemplateVersion: integer('prompt_template_version').notNull(),
  model: text('model').notNull(),
  temperature: numeric('temperature'),
  inputDigest: text('input_digest').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  latencyMs: integer('latency_ms').notNull().default(0),
  costMicros: integer('cost_micros').notNull().default(0),
  attempt: integer('attempt').notNull().default(1),
  validationErrors: jsonb('validation_errors').$type<unknown>(),
  output: jsonb('output').$type<unknown>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const debateSpeechAnalyses = pgTable('debate_speech_analyses', {
  id: primaryId(),
  runId: uuid('run_id')
    .notNull()
    .references(() => debateAdjudicationRuns.id, { onDelete: 'cascade' }),
  turnId: uuid('turn_id')
    .notNull()
    .references(() => debateTurns.id, { onDelete: 'cascade' }),
  debateId: uuid('debate_id')
    .notNull()
    .references(() => debates.id, { onDelete: 'cascade' }),
  arguments: jsonb('arguments').$type<unknown[]>().notNull().default([]),
  rebuttals: jsonb('rebuttals').$type<unknown[]>().notNull().default([]),
  droppedByOpponent: jsonb('dropped_by_opponent').$type<unknown[]>().notNull().default([]),
  roleFulfilment: jsonb('role_fulfilment').$type<Record<string, unknown>>().notNull().default({}),
  manner: jsonb('manner').$type<Record<string, unknown>>().notNull().default({}),
  quotes: jsonb('quotes').$type<unknown[]>().notNull().default([]),
  anatomyAxisScores: jsonb('anatomy_axis_scores').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const debateClashes = pgTable('debate_clashes', {
  id: primaryId(),
  runId: uuid('run_id')
    .notNull()
    .references(() => debateAdjudicationRuns.id, { onDelete: 'cascade' }),
  debateId: uuid('debate_id')
    .notNull()
    .references(() => debates.id, { onDelete: 'cascade' }),
  orderIndex: integer('order_index').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  propArgumentRefs: jsonb('prop_argument_refs').$type<unknown[]>().notNull().default([]),
  oppArgumentRefs: jsonb('opp_argument_refs').$type<unknown[]>().notNull().default([]),
  winner: text('winner').notNull(),
  margin: text('margin').notNull(),
  reasoning: text('reasoning').notNull(),
  weight: numeric('weight').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const debateVerdicts = pgTable('debate_verdicts', {
  id: primaryId(),
  runId: uuid('run_id')
    .notNull()
    .unique()
    .references(() => debateAdjudicationRuns.id, { onDelete: 'cascade' }),
  debateId: uuid('debate_id')
    .notNull()
    .references(() => debates.id, { onDelete: 'cascade' }),
  ranking: jsonb('ranking').$type<unknown[]>().notNull().default([]),
  winner: text('winner').notNull(),
  reasoning: text('reasoning').notNull(),
  decisiveClashId: uuid('decisive_clash_id').references(() => debateClashes.id, { onDelete: 'set null' }),
  scoreConfidence: text('score_confidence').notNull().default('beta'),
  templateKey: text('template_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const debateSpeakerScores = pgTable('debate_speaker_scores', {
  id: primaryId(),
  runId: uuid('run_id')
    .notNull()
    .references(() => debateAdjudicationRuns.id, { onDelete: 'cascade' }),
  debateId: uuid('debate_id')
    .notNull()
    .references(() => debates.id, { onDelete: 'cascade' }),
  turnId: uuid('turn_id').references(() => debateTurns.id, { onDelete: 'set null' }),
  participantId: uuid('participant_id').references(() => debateParticipants.id, { onDelete: 'set null' }),
  score: numeric('score').notNull(),
  scale: jsonb('scale').$type<Record<string, unknown>>().notNull().default({}),
  bandLabel: text('band_label'),
  axisScores: jsonb('axis_scores').$type<Record<string, unknown>>().notNull().default({}),
  confidence: text('confidence').notNull().default('beta'),
  rationale: text('rationale'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const debateFeedbackReports = pgTable('debate_feedback_reports', {
  id: primaryId(),
  runId: uuid('run_id')
    .notNull()
    .unique()
    .references(() => debateAdjudicationRuns.id, { onDelete: 'cascade' }),
  debateId: uuid('debate_id')
    .notNull()
    .references(() => debates.id, { onDelete: 'cascade' }),
  institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
  independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
    onDelete: 'cascade',
  }),
  perSpeaker: jsonb('per_speaker').$type<unknown[]>().notNull().default([]),
  roundSummary: text('round_summary').notNull().default(''),
  shareToken: text('share_token'),
  shareScope: text('share_scope').notNull().default('private'),
  pdfObjectId: uuid('pdf_object_id').references(() => storageObjects.id, { onDelete: 'set null' }),
  viewedAt: timestamp('viewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const debatePrepNotes = pgTable('debate_prep_notes', {
  id: primaryId(),
  debateId: uuid('debate_id')
    .notNull()
    .references(() => debates.id, { onDelete: 'cascade' }),
  institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'set null' }),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
  independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
    onDelete: 'cascade',
  }),
  blocks: jsonb('blocks').$type<unknown[]>().notNull().default([]),
  scaffoldTemplateKey: text('scaffold_template_key'),
  aiAssistUsed: boolean('ai_assist_used').notNull().default(false),
  aiAssistEvents: jsonb('ai_assist_events').$type<unknown[]>().notNull().default([]),
  version: integer('version').notNull().default(1),
  ...timestamps,
});

export const debateSkillSnapshots = pgTable('debate_skill_snapshots', {
  id: primaryId(),
  institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'set null' }),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
  independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
    onDelete: 'cascade',
  }),
  formatKey: text('format_key').notNull(),
  asOf: date('as_of').notNull(),
  roundsCounted: integer('rounds_counted').notNull().default(0),
  axisEwma: jsonb('axis_ewma').$type<Record<string, unknown>>().notNull().default({}),
  manner: jsonb('manner').$type<Record<string, unknown>>().notNull().default({}),
  roleFulfilmentEwma: numeric('role_fulfilment_ewma'),
  focusDirectiveHistory: jsonb('focus_directive_history').$type<unknown[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const debateAiOpponentScripts = pgTable('debate_ai_opponent_scripts', {
  id: primaryId(),
  debateId: uuid('debate_id')
    .notNull()
    .references(() => debates.id, { onDelete: 'cascade' }),
  turnId: uuid('turn_id')
    .notNull()
    .references(() => debateTurns.id, { onDelete: 'cascade' }),
  personaKey: text('persona_key').notNull(),
  difficulty: text('difficulty').notNull(),
  inputDigest: text('input_digest').notNull(),
  script: text('script').notNull(),
  plan: jsonb('plan').$type<Record<string, unknown>>().notNull().default({}),
  ttsObjectId: uuid('tts_object_id').references(() => storageObjects.id, { onDelete: 'set null' }),
  ttsProvider: text('tts_provider'),
  ttsVoiceKey: text('tts_voice_key'),
  ttsDurationMs: integer('tts_duration_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const debateMotionSuggestions = pgTable('debate_motion_suggestions', {
  id: primaryId(),
  themes: text('themes').array().notNull().default([]),
  difficulty: integer('difficulty').notNull(),
  formatKey: text('format_key').notNull(),
  seed: text('seed').notNull(),
  motions: jsonb('motions').$type<unknown[]>().notNull().default([]),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
