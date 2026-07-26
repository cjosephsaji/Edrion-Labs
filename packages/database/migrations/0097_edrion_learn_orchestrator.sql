-- Edrion Learn P1.1: orchestrator storage, profiles, mastery, session events.

ALTER TABLE concept_atoms
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;
--> statement-breakpoint
UPDATE concept_atoms SET updated_at = created_at WHERE updated_at IS NULL;
--> statement-breakpoint
ALTER TABLE concept_atoms
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;
--> statement-breakpoint

ALTER TABLE learn_sessions
  ADD COLUMN IF NOT EXISTS entry_point text,
  ADD COLUMN IF NOT EXISTS orchestrator_status text,
  ADD COLUMN IF NOT EXISTS state jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS session_context jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS policy_snapshot jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS time_budget_minutes integer,
  ADD COLUMN IF NOT EXISTS elapsed_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checkpoints_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checkpoints_done integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plan_move_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS end_reason text,
  ADD COLUMN IF NOT EXISTS active_key text,
  ADD COLUMN IF NOT EXISTS last_event_seq bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS orchestrator_updated_at timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE learn_sessions ADD CONSTRAINT learn_sessions_entry_point_ck CHECK (
    entry_point IS NULL OR entry_point IN (
      'learning_path', 'free_chat_handoff', 'library_document', 'review_queue',
      'goal', 'prep_countdown', 'bad_result', 'upcoming_exam'
    )
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE learn_sessions ADD CONSTRAINT learn_sessions_orchestrator_status_ck CHECK (
    orchestrator_status IS NULL OR orchestrator_status IN (
      'created', 'active', 'awaiting_response', 'paused', 'closing', 'closed'
    )
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS learn_sessions_student_active_orchestrator_uq
  ON learn_sessions (student_id)
  WHERE student_id IS NOT NULL
    AND entry_point IS NOT NULL
    AND orchestrator_status IN ('created', 'active', 'awaiting_response', 'paused', 'closing');
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS learn_sessions_indep_active_orchestrator_uq
  ON learn_sessions (independent_user_id)
  WHERE independent_user_id IS NOT NULL
    AND entry_point IS NOT NULL
    AND orchestrator_status IN ('created', 'active', 'awaiting_response', 'paused', 'closing');
--> statement-breakpoint

ALTER TABLE learn_session_blocks
  ADD COLUMN IF NOT EXISTS move_type text,
  ADD COLUMN IF NOT EXISTS block_schema_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reasoning jsonb,
  ADD COLUMN IF NOT EXISTS degraded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS interaction_state jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS stream_seq bigint,
  ADD COLUMN IF NOT EXISTS render_status text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS learn_session_blocks_session_stream_seq_uq
  ON learn_session_blocks (session_id, stream_seq)
  WHERE stream_seq IS NOT NULL;
--> statement-breakpoint

ALTER TABLE learn_attempts
  ADD COLUMN IF NOT EXISTS question_id text;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS learn_attempts_session_block_question_uq
  ON learn_attempts (session_id, block_id, question_id)
  WHERE session_id IS NOT NULL AND block_id IS NOT NULL AND question_id IS NOT NULL;
--> statement-breakpoint

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
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE learn_ai_calls ADD CONSTRAINT learn_ai_calls_session_id_fk
    FOREIGN KEY (session_id) REFERENCES learn_sessions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE learn_ai_calls ADD CONSTRAINT learn_ai_calls_block_id_fk
    FOREIGN KEY (block_id) REFERENCES learn_session_blocks(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS learn_topic_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  learn_topic_id uuid REFERENCES learn_topics(id) ON DELETE CASCADE,
  topic_key text,
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  profile jsonb NOT NULL DEFAULT '{}',
  source text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT learn_topic_profiles_source_ck CHECK (source IN ('generated', 'human_override')),
  CONSTRAINT learn_topic_profiles_owner_ck CHECK (
    NOT (institution_id IS NOT NULL AND independent_user_id IS NOT NULL)
  ),
  CONSTRAINT learn_topic_profiles_topic_ref_ck CHECK (
    learn_topic_id IS NOT NULL OR topic_key IS NOT NULL
  )
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS learn_topic_profiles_inst_topic_uq
  ON learn_topic_profiles (institution_id, learn_topic_id)
  WHERE institution_id IS NOT NULL AND learn_topic_id IS NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS learn_topic_profiles_inst_topic_key_uq
  ON learn_topic_profiles (institution_id, topic_key)
  WHERE institution_id IS NOT NULL AND learn_topic_id IS NULL AND topic_key IS NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS learn_topic_profiles_indep_topic_uq
  ON learn_topic_profiles (independent_user_id, learn_topic_id)
  WHERE independent_user_id IS NOT NULL AND learn_topic_id IS NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS learn_topic_profiles_indep_topic_key_uq
  ON learn_topic_profiles (independent_user_id, topic_key)
  WHERE independent_user_id IS NOT NULL AND learn_topic_id IS NULL AND topic_key IS NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS learn_topic_profiles_global_topic_key_uq
  ON learn_topic_profiles (topic_key)
  WHERE institution_id IS NULL AND independent_user_id IS NULL AND topic_key IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS learner_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  atom_id uuid NOT NULL REFERENCES concept_atoms(id) ON DELETE CASCADE,
  rating integer NOT NULL DEFAULT 800,
  attempts integer NOT NULL DEFAULT 0,
  correct_weight numeric NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT learner_mastery_owner_xor CHECK (num_nonnulls(student_id, independent_user_id) = 1),
  CONSTRAINT learner_mastery_rating_ck CHECK (rating BETWEEN 400 AND 2400)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS learner_mastery_student_atom_uq
  ON learner_mastery (student_id, atom_id)
  WHERE student_id IS NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS learner_mastery_indep_atom_uq
  ON learner_mastery (independent_user_id, atom_id)
  WHERE independent_user_id IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS learner_model_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES learn_sessions(id) ON DELETE SET NULL,
  attempt_id uuid REFERENCES learn_attempts(id) ON DELETE SET NULL,
  atom_id uuid REFERENCES concept_atoms(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  idempotency_key text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learner_model_events_owner_xor CHECK (num_nonnulls(student_id, independent_user_id) = 1)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS learner_model_events_student_idem_uq
  ON learner_model_events (student_id, idempotency_key)
  WHERE student_id IS NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS learner_model_events_indep_idem_uq
  ON learner_model_events (independent_user_id, idempotency_key)
  WHERE independent_user_id IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS learn_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  session_id uuid NOT NULL REFERENCES learn_sessions(id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learn_session_events_session_seq_uq UNIQUE (session_id, seq)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS learn_session_events_session_seq_idx
  ON learn_session_events (session_id, seq DESC);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION edrion_current_institution() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.institution_id', true), '');
$$ LANGUAGE sql STABLE;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION edrion_current_student() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.student_id', true), '');
$$ LANGUAGE sql STABLE;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION edrion_current_independent_user() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.independent_user_id', true), '');
$$ LANGUAGE sql STABLE;
--> statement-breakpoint

-- Student-private RLS (mirrors exam engine / Today pattern).
ALTER TABLE learn_topic_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_topic_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learn_topic_profiles_owner_private ON learn_topic_profiles;
CREATE POLICY learn_topic_profiles_owner_private ON learn_topic_profiles FOR ALL
USING (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
  OR (
    edrion_current_institution() IS NOT NULL
    AND institution_id IS NOT NULL
    AND institution_id::text = edrion_current_institution()
    AND independent_user_id IS NULL
  )
)
WITH CHECK (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
  OR (
    edrion_current_institution() IS NOT NULL
    AND institution_id IS NOT NULL
    AND institution_id::text = edrion_current_institution()
    AND independent_user_id IS NULL
  )
);
--> statement-breakpoint

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['learner_mastery', 'learner_model_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_owner_private ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_owner_private ON %I FOR ALL USING (
        (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
        OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student())
        OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
      ) WITH CHECK (
        (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
        OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student())
        OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
      )', tbl, tbl
    );
  END LOOP;
END $$;
--> statement-breakpoint

ALTER TABLE learn_session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_session_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learn_session_events_owner_private ON learn_session_events;
CREATE POLICY learn_session_events_owner_private ON learn_session_events FOR ALL
USING (EXISTS (
  SELECT 1 FROM learn_sessions ls WHERE ls.id = learn_session_events.session_id
    AND (
      (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
      OR (edrion_current_student() IS NOT NULL AND ls.student_id::text = edrion_current_student())
      OR (edrion_current_independent_user() IS NOT NULL AND ls.independent_user_id::text = edrion_current_independent_user())
    )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM learn_sessions ls WHERE ls.id = learn_session_events.session_id
    AND (
      (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
      OR (edrion_current_student() IS NOT NULL AND ls.student_id::text = edrion_current_student())
      OR (edrion_current_independent_user() IS NOT NULL AND ls.independent_user_id::text = edrion_current_independent_user())
    )
));
