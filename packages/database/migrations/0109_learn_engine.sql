-- 0109_learn_engine
-- Petros Learn v2 engine schema. Replaces topic profiles with topic shapes,
-- adds lesson_shape on sessions, renames block move_type → surface, defaults
-- block_schema_version to 2. Restores student-table FKs destroyed by CASCADE.

CREATE TABLE learn_topic_shapes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learn_topic_id uuid REFERENCES learn_topics(id) ON DELETE CASCADE,
  topic_key text NOT NULL,
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  shape jsonb NOT NULL,
  shape_schema_version integer NOT NULL DEFAULT 1,
  source text NOT NULL CHECK (source IN ('generated', 'human_override', 'provisional')),
  model text,
  prompt_version text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learn_topic_shapes_owner_ck CHECK (num_nonnulls(institution_id, independent_user_id) = 1)
);

CREATE UNIQUE INDEX learn_topic_shapes_institution_topic_id_uq
  ON learn_topic_shapes (institution_id, learn_topic_id)
  WHERE institution_id IS NOT NULL AND learn_topic_id IS NOT NULL;
CREATE UNIQUE INDEX learn_topic_shapes_institution_topic_key_uq
  ON learn_topic_shapes (institution_id, topic_key) WHERE institution_id IS NOT NULL;
CREATE UNIQUE INDEX learn_topic_shapes_independent_topic_id_uq
  ON learn_topic_shapes (independent_user_id, learn_topic_id)
  WHERE independent_user_id IS NOT NULL AND learn_topic_id IS NOT NULL;
CREATE UNIQUE INDEX learn_topic_shapes_independent_topic_key_uq
  ON learn_topic_shapes (independent_user_id, topic_key)
  WHERE independent_user_id IS NOT NULL;

CREATE TABLE learn_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES learn_topics(id) ON DELETE SET NULL,
  topic_shape_id uuid REFERENCES learn_topic_shapes(id) ON DELETE SET NULL,
  path_item_id uuid REFERENCES learning_path_items(id) ON DELETE SET NULL,
  grounding_knowledge_item_id uuid,
  entry_point text,
  entry_ref jsonb,
  status text NOT NULL DEFAULT 'active',
  orchestrator_status text,
  lesson_shape jsonb NOT NULL DEFAULT '{}'::jsonb,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  session_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  time_budget_minutes integer,
  elapsed_minutes integer NOT NULL DEFAULT 0,
  checkpoints_total integer NOT NULL DEFAULT 0,
  checkpoints_done integer NOT NULL DEFAULT 0,
  plan_move_count integer NOT NULL DEFAULT 0,
  end_reason text,
  active_key text,
  last_event_seq bigint NOT NULL DEFAULT 0,
  last_block_seq bigint NOT NULL DEFAULT 0,
  summary jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  paused_at timestamptz,
  ended_at timestamptz,
  completed_at timestamptz,
  orchestrator_updated_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT learn_sessions_owner_ck CHECK (num_nonnulls(student_id, independent_user_id) = 1),
  CONSTRAINT learn_sessions_entry_point_ck CHECK (
    entry_point IS NULL OR entry_point IN (
      'learning_path', 'free_chat_handoff', 'library_document', 'review_queue',
      'goal', 'prep_countdown', 'bad_result', 'upcoming_exam'
    )
  ),
  CONSTRAINT learn_sessions_orchestrator_status_ck CHECK (
    orchestrator_status IS NULL OR orchestrator_status IN (
      'created', 'active', 'awaiting_response', 'paused', 'closing', 'closed'
    )
  )
);

CREATE INDEX learn_sessions_student_idx ON learn_sessions (student_id, started_at DESC);
CREATE INDEX learn_sessions_indep_idx ON learn_sessions (independent_user_id, started_at DESC);

CREATE UNIQUE INDEX learn_sessions_student_active_orchestrator_uq
  ON learn_sessions (student_id)
  WHERE student_id IS NOT NULL
    AND entry_point IS NOT NULL
    AND orchestrator_status IN ('created', 'active', 'awaiting_response', 'paused', 'closing');

CREATE UNIQUE INDEX learn_sessions_independent_active_orchestrator_uq
  ON learn_sessions (independent_user_id)
  WHERE independent_user_id IS NOT NULL
    AND entry_point IS NOT NULL
    AND orchestrator_status IN ('created', 'active', 'awaiting_response', 'paused', 'closing');

CREATE TABLE learn_session_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES learn_sessions(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  block_type text NOT NULL,
  content jsonb NOT NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  surface text,
  block_schema_version integer NOT NULL DEFAULT 2,
  reasoning text,
  degraded boolean NOT NULL DEFAULT false,
  interaction_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  stream_seq bigint,
  render_status text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learn_session_blocks_session_seq_uq UNIQUE (session_id, sequence)
);

CREATE UNIQUE INDEX learn_session_blocks_session_stream_seq_uq
  ON learn_session_blocks (session_id, stream_seq) WHERE stream_seq IS NOT NULL;

CREATE TABLE learn_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES learn_sessions(id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learn_session_events_session_seq_uq UNIQUE (session_id, seq)
);

CREATE INDEX learn_session_events_session_seq_idx ON learn_session_events (session_id, seq);

CREATE TABLE learn_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES learn_sessions(id) ON DELETE SET NULL,
  block_id uuid REFERENCES learn_session_blocks(id) ON DELETE SET NULL,
  question_id text,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  input jsonb NOT NULL,
  evaluation jsonb NOT NULL,
  hints_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learn_attempts_owner_ck CHECK (num_nonnulls(student_id, independent_user_id) = 1)
);

CREATE UNIQUE INDEX learn_attempts_session_block_question_uq
  ON learn_attempts (session_id, block_id, question_id)
  WHERE session_id IS NOT NULL AND block_id IS NOT NULL AND question_id IS NOT NULL;

-- Learner-digest covering indexes (attempt history fan-in).
CREATE INDEX learn_attempts_student_created_idx
  ON learn_attempts (student_id, created_at DESC) WHERE student_id IS NOT NULL;
CREATE INDEX learn_attempts_independent_created_idx
  ON learn_attempts (independent_user_id, created_at DESC) WHERE independent_user_id IS NOT NULL;

CREATE TABLE learner_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  atom_id uuid NOT NULL REFERENCES concept_atoms(id) ON DELETE CASCADE,
  rating integer NOT NULL DEFAULT 1200 CHECK (rating BETWEEN 400 AND 2400),
  attempts integer NOT NULL DEFAULT 0,
  correct_weight numeric NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learner_mastery_owner_ck CHECK (num_nonnulls(student_id, independent_user_id) = 1)
);

CREATE UNIQUE INDEX learner_mastery_student_atom_uq
  ON learner_mastery (student_id, atom_id) WHERE student_id IS NOT NULL;
CREATE UNIQUE INDEX learner_mastery_independent_atom_uq
  ON learner_mastery (independent_user_id, atom_id) WHERE independent_user_id IS NOT NULL;

CREATE TABLE learner_model_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES learn_sessions(id) ON DELETE SET NULL,
  attempt_id uuid REFERENCES learn_attempts(id) ON DELETE SET NULL,
  atom_id uuid REFERENCES concept_atoms(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learner_model_events_owner_ck CHECK (num_nonnulls(student_id, independent_user_id) = 1)
);

CREATE UNIQUE INDEX learner_model_events_student_idempotency_uq
  ON learner_model_events (student_id, idempotency_key) WHERE student_id IS NOT NULL;
CREATE UNIQUE INDEX learner_model_events_independent_idempotency_uq
  ON learner_model_events (independent_user_id, idempotency_key)
  WHERE independent_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION learner_model_events_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'learner_model_events is append-only'; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER learner_model_events_no_update
  BEFORE UPDATE OR DELETE ON learner_model_events
  FOR EACH ROW EXECUTE FUNCTION learner_model_events_immutable();

CREATE TABLE learner_model_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  pace_preference text,
  move_outcome_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  short_dwell_streak integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learner_model_state_owner_ck CHECK (num_nonnulls(student_id, independent_user_id) = 1),
  CONSTRAINT learner_model_state_pace_ck CHECK (
    pace_preference IS NULL OR pace_preference IN ('slow', 'normal', 'fast')
  )
);

CREATE UNIQUE INDEX learner_model_state_student_uq ON learner_model_state (student_id)
  WHERE student_id IS NOT NULL;
CREATE UNIQUE INDEX learner_model_state_independent_uq ON learner_model_state (independent_user_id)
  WHERE independent_user_id IS NOT NULL;

CREATE TABLE evidence_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  tag_key text NOT NULL,
  label text NOT NULL,
  polarity text NOT NULL,
  note text NOT NULL,
  evidence_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  computed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_tags_owner_ck CHECK (num_nonnulls(student_id, independent_user_id) = 1)
);

CREATE UNIQUE INDEX evidence_tags_student_tag_uq ON evidence_tags (student_id, tag_key)
  WHERE student_id IS NOT NULL;
CREATE UNIQUE INDEX evidence_tags_indep_tag_uq ON evidence_tags (independent_user_id, tag_key)
  WHERE independent_user_id IS NOT NULL;

CREATE TABLE learn_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  scope text NOT NULL DEFAULT 'global',
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  value_type text NOT NULL,
  value text NOT NULL,
  description text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learn_config_key_ck CHECK (key ~ '^learn\.[a-z0-9_]+$'),
  CONSTRAINT learn_config_scope_ck CHECK (scope IN ('global', 'institution', 'independent_user')),
  CONSTRAINT learn_config_value_type_ck CHECK (value_type IN ('number', 'string', 'boolean')),
  CONSTRAINT learn_config_owner_ck CHECK (
    (scope = 'global' AND num_nonnulls(institution_id, independent_user_id) = 0)
    OR (scope = 'institution' AND institution_id IS NOT NULL AND independent_user_id IS NULL)
    OR (scope = 'independent_user' AND independent_user_id IS NOT NULL AND institution_id IS NULL)
  )
);

CREATE UNIQUE INDEX learn_config_global_key_uq ON learn_config (key) WHERE scope = 'global';
CREATE UNIQUE INDEX learn_config_institution_key_uq ON learn_config (institution_id, key)
  WHERE scope = 'institution';
CREATE UNIQUE INDEX learn_config_independent_key_uq ON learn_config (independent_user_id, key)
  WHERE scope = 'independent_user';

-- Fold back global defaults (formerly 0104).
INSERT INTO learn_config (key, scope, value_type, value, description) VALUES
  ('learn.move_cap', 'global', 'number', '14', 'Max planned moves / checkpoints per session.'),
  ('learn.profile_ttl_days', 'global', 'number', '180', 'Deprecated with topic shapes; retained for config compatibility.'),
  ('learn.plan_model_tier', 'global', 'string', 'small', 'Lesson-shape labelling tier.'),
  ('learn.render_model_tier', 'global', 'string', 'mid', 'Block generation tier.'),
  ('learn.grade_model_tier', 'global', 'string', 'small', 'Ambiguous short-text grading tier.'),
  ('learn.judge_model_tier', 'global', 'string', 'mid', 'Eval harness judge tier.'),
  ('learn.profiler_model_tier', 'global', 'string', 'small', 'Topic-shape generation tier (maps to large at call site when needed).'),
  ('learn.max_free_questions_per_session', 'global', 'number', '5', 'Composer free questions per session.'),
  ('learn.daily_session_cap_per_user', 'global', 'number', '12', 'Soft daily session cap.'),
  ('learn.speculative_planning', 'global', 'boolean', 'true', 'Enable speculation across branch-invariant boundaries.'),
  ('learn.default_session_minutes', 'global', 'number', '15', 'Default time budget when none is supplied.');

-- Restore learn_ai_calls FKs.
ALTER TABLE learn_ai_calls DROP CONSTRAINT IF EXISTS learn_ai_calls_session_id_fk;
ALTER TABLE learn_ai_calls DROP CONSTRAINT IF EXISTS learn_ai_calls_block_id_fk;
ALTER TABLE learn_ai_calls ADD CONSTRAINT learn_ai_calls_session_id_fk
  FOREIGN KEY (session_id) REFERENCES learn_sessions(id) ON DELETE SET NULL;
ALTER TABLE learn_ai_calls ADD CONSTRAINT learn_ai_calls_block_id_fk
  FOREIGN KEY (block_id) REFERENCES learn_session_blocks(id) ON DELETE SET NULL;

-- Restore student-owned FKs dropped by CASCADE. Null orphans first.
UPDATE flashcard_decks SET source_session_id = NULL
  WHERE source_session_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM learn_sessions s WHERE s.id = flashcard_decks.source_session_id);
UPDATE knowledge_artifacts SET source_session_id = NULL
  WHERE source_session_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM learn_sessions s WHERE s.id = knowledge_artifacts.source_session_id);
UPDATE visual_canvases SET source_session_id = NULL
  WHERE source_session_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM learn_sessions s WHERE s.id = visual_canvases.source_session_id);

ALTER TABLE flashcard_decks DROP CONSTRAINT IF EXISTS flashcard_decks_source_session_id_fk;
ALTER TABLE knowledge_artifacts DROP CONSTRAINT IF EXISTS knowledge_artifacts_source_session_id_fk;
ALTER TABLE visual_canvases DROP CONSTRAINT IF EXISTS visual_canvases_source_session_id_fk;

ALTER TABLE flashcard_decks ADD CONSTRAINT flashcard_decks_source_session_id_fk
  FOREIGN KEY (source_session_id) REFERENCES learn_sessions(id) ON DELETE SET NULL;
ALTER TABLE knowledge_artifacts ADD CONSTRAINT knowledge_artifacts_source_session_id_fk
  FOREIGN KEY (source_session_id) REFERENCES learn_sessions(id) ON DELETE SET NULL;
ALTER TABLE visual_canvases ADD CONSTRAINT visual_canvases_source_session_id_fk
  FOREIGN KEY (source_session_id) REFERENCES learn_sessions(id) ON DELETE SET NULL;

GRANT SELECT, INSERT, UPDATE ON learn_sessions, learn_session_blocks, learn_attempts,
  learn_topic_shapes, learner_mastery, learn_session_events, learner_model_state,
  evidence_tags, learn_config TO edrion_app;
GRANT SELECT, INSERT ON learner_model_events TO edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON learner_model_events FROM edrion_app;
