-- P1.1: Edrion Learn orchestrator — additive storage extensions and new tables.
-- Preserves legacy learn_sessions rows; orchestrator columns are nullable until P1.4.

-- ── concept_atoms: profile invalidation signal ───────────────────────────────
ALTER TABLE concept_atoms
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE concept_atoms
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE concept_atoms
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

-- ── learn_sessions: orchestrator columns ─────────────────────────────────────
ALTER TABLE learn_sessions
  ADD COLUMN IF NOT EXISTS topic_profile_id uuid,
  ADD COLUMN IF NOT EXISTS entry_point text,
  ADD COLUMN IF NOT EXISTS entry_ref jsonb,
  ADD COLUMN IF NOT EXISTS orchestrator_status text,
  ADD COLUMN IF NOT EXISTS state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS session_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS time_budget_minutes integer,
  ADD COLUMN IF NOT EXISTS elapsed_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checkpoints_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checkpoints_done integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plan_move_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS end_reason text,
  ADD COLUMN IF NOT EXISTS active_key text,
  ADD COLUMN IF NOT EXISTS last_event_seq bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS summary jsonb,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS orchestrator_updated_at timestamptz;

UPDATE learn_sessions
SET orchestrator_status = 'closed',
    orchestrator_updated_at = COALESCE(completed_at, started_at)
WHERE entry_point IS NULL AND orchestrator_status IS NULL;

DO $$ BEGIN
  ALTER TABLE learn_sessions ADD CONSTRAINT learn_sessions_entry_point_ck CHECK (
    entry_point IS NULL OR entry_point IN (
      'learning_path', 'free_chat_handoff', 'library_document', 'review_queue',
      'goal', 'prep_countdown', 'bad_result', 'upcoming_exam'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE learn_sessions ADD CONSTRAINT learn_sessions_orchestrator_status_ck CHECK (
    orchestrator_status IS NULL OR orchestrator_status IN (
      'created', 'active', 'awaiting_response', 'paused', 'closing', 'closed'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS learn_sessions_student_active_orchestrator_uq
  ON learn_sessions (student_id)
  WHERE student_id IS NOT NULL
    AND entry_point IS NOT NULL
    AND orchestrator_status IN ('created', 'active', 'awaiting_response', 'paused', 'closing');

CREATE UNIQUE INDEX IF NOT EXISTS learn_sessions_independent_active_orchestrator_uq
  ON learn_sessions (independent_user_id)
  WHERE independent_user_id IS NOT NULL
    AND entry_point IS NOT NULL
    AND orchestrator_status IN ('created', 'active', 'awaiting_response', 'paused', 'closing');

-- ── learn_session_blocks: orchestrator block metadata ────────────────────────
ALTER TABLE learn_session_blocks
  ADD COLUMN IF NOT EXISTS move_type text,
  ADD COLUMN IF NOT EXISTS block_schema_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reasoning text,
  ADD COLUMN IF NOT EXISTS degraded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS interaction_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS stream_seq bigint,
  ADD COLUMN IF NOT EXISTS render_status text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE learn_session_blocks
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE learn_session_blocks
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS learn_session_blocks_session_stream_seq_uq
  ON learn_session_blocks (session_id, stream_seq)
  WHERE stream_seq IS NOT NULL;

-- ── learn_attempts: idempotent question answers ────────────────────────────────
ALTER TABLE learn_attempts
  ADD COLUMN IF NOT EXISTS question_id text;

CREATE UNIQUE INDEX IF NOT EXISTS learn_attempts_session_block_question_uq
  ON learn_attempts (session_id, block_id, question_id)
  WHERE session_id IS NOT NULL
    AND block_id IS NOT NULL
    AND question_id IS NOT NULL;

-- ── learn_ai_calls: session/block context ────────────────────────────────────
ALTER TABLE learn_ai_calls
  ADD COLUMN IF NOT EXISTS session_id uuid,
  ADD COLUMN IF NOT EXISTS block_id uuid,
  ADD COLUMN IF NOT EXISTS block_seq integer,
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS retry boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS speculative boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS degraded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS first_token_ms integer;

DO $$ BEGIN
  ALTER TABLE learn_ai_calls ADD CONSTRAINT learn_ai_calls_session_id_fk
    FOREIGN KEY (session_id) REFERENCES learn_sessions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE learn_ai_calls ADD CONSTRAINT learn_ai_calls_block_id_fk
    FOREIGN KEY (block_id) REFERENCES learn_session_blocks(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── learn_topic_profiles ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learn_topic_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learn_topic_id uuid REFERENCES learn_topics(id) ON DELETE CASCADE,
  topic_key text NOT NULL,
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  title text NOT NULL,
  profile jsonb NOT NULL,
  profile_schema_version integer NOT NULL DEFAULT 1,
  source text NOT NULL CHECK (source IN ('generated', 'human_override')),
  overridden_by uuid,
  model text,
  prompt_version text,
  expires_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learn_topic_profiles_owner_ck CHECK (
    (institution_id IS NOT NULL AND independent_user_id IS NULL)
    OR (institution_id IS NULL AND independent_user_id IS NOT NULL)
    OR (institution_id IS NULL AND independent_user_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS learn_topic_profiles_institution_topic_id_uq
  ON learn_topic_profiles (institution_id, learn_topic_id)
  WHERE institution_id IS NOT NULL AND learn_topic_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS learn_topic_profiles_institution_topic_key_uq
  ON learn_topic_profiles (institution_id, topic_key)
  WHERE institution_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS learn_topic_profiles_independent_topic_id_uq
  ON learn_topic_profiles (independent_user_id, learn_topic_id)
  WHERE independent_user_id IS NOT NULL AND learn_topic_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS learn_topic_profiles_independent_topic_key_uq
  ON learn_topic_profiles (independent_user_id, topic_key)
  WHERE independent_user_id IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE learn_sessions ADD CONSTRAINT learn_sessions_topic_profile_id_fk
    FOREIGN KEY (topic_profile_id) REFERENCES learn_topic_profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── learner_mastery ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learner_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  atom_id uuid NOT NULL REFERENCES concept_atoms(id) ON DELETE CASCADE,
  rating integer NOT NULL DEFAULT 800 CHECK (rating BETWEEN 400 AND 2400),
  attempts integer NOT NULL DEFAULT 0,
  correct_weight numeric NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learner_mastery_owner_ck CHECK (num_nonnulls(student_id, independent_user_id) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS learner_mastery_student_atom_uq
  ON learner_mastery (student_id, atom_id)
  WHERE student_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS learner_mastery_independent_atom_uq
  ON learner_mastery (independent_user_id, atom_id)
  WHERE independent_user_id IS NOT NULL;

-- ── learner_model_events (append-only replay log) ────────────────────────────
CREATE TABLE IF NOT EXISTS learner_model_events (
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

CREATE UNIQUE INDEX IF NOT EXISTS learner_model_events_student_idempotency_uq
  ON learner_model_events (student_id, idempotency_key)
  WHERE student_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS learner_model_events_independent_idempotency_uq
  ON learner_model_events (independent_user_id, idempotency_key)
  WHERE independent_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION learner_model_events_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'learner_model_events is append-only'; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS learner_model_events_no_update ON learner_model_events;
CREATE TRIGGER learner_model_events_no_update
  BEFORE UPDATE OR DELETE ON learner_model_events
  FOR EACH ROW EXECUTE FUNCTION learner_model_events_immutable();

-- ── learn_session_events (SSE audit / replay) ────────────────────────────────
CREATE TABLE IF NOT EXISTS learn_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES learn_sessions(id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learn_session_events_session_seq_uq UNIQUE (session_id, seq)
);

CREATE INDEX IF NOT EXISTS learn_session_events_session_seq_idx
  ON learn_session_events (session_id, seq);

-- ── SelfDeclaredGoalV1 backfill on learning_paths.goal ───────────────────────
UPDATE learning_paths
SET goal = jsonb_build_object(
  'v', 1,
  'statement', COALESCE(NULLIF(goal->>'statement', ''), NULLIF(goal->>'goalStatement', ''), ''),
  'outcome', CASE WHEN goal ? 'outcome' THEN goal->'outcome' ELSE NULL END,
  'constraints', CASE
    WHEN jsonb_typeof(goal->'constraints') = 'array' THEN goal->'constraints'
    WHEN goal ? 'constraints' AND NULLIF(goal->>'constraints', '') IS NOT NULL
      THEN jsonb_build_array(goal->>'constraints')
    ELSE '[]'::jsonb
  END,
  'weekly_minutes', COALESCE(
    NULLIF(goal->>'weekly_minutes', '')::integer,
    NULLIF(goal->>'weeklyMinutes', '')::integer,
    60
  ),
  'target_date', CASE WHEN goal ? 'target_date' THEN goal->>'target_date' ELSE NULL END,
  'preferred_days', CASE WHEN goal ? 'preferred_days' THEN goal->'preferred_days' ELSE NULL END,
  'default_session_minutes', COALESCE(
    NULLIF(goal->>'default_session_minutes', '')::integer,
    15
  ),
  'source', COALESCE(NULLIF(goal->>'source', ''), 'self_declared'),
  'created_at', COALESCE(goal->>'created_at', goal->>'createdAt', now()::text),
  'updated_at', COALESCE(goal->>'updated_at', goal->>'updatedAt', now()::text)
)
WHERE goal IS NOT NULL
  AND COALESCE(goal->>'v', '') <> '1';

-- ── Grants (edrion_app) ──────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON learn_topic_profiles, learner_mastery, learn_session_events TO edrion_app;
GRANT SELECT, INSERT ON learner_model_events TO edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON learner_model_events FROM edrion_app;
