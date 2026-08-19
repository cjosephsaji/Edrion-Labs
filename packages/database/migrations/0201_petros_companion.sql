-- Petros companion: persistent student-owned threads, typed messages, confirmed actions,
-- and student-controlled companion preferences.

CREATE TABLE IF NOT EXISTS petros_student_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version text NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES campuses(id) ON DELETE SET NULL,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title text,
  active_topic text,
  active_focus_ref text,
  -- Compact rolling summary of turns older than the verbatim window.
  summary text,
  -- Number of messages already folded into `summary`.
  summary_watermark integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_student_threads_status_ck CHECK(status IN ('active','archived'))
);
CREATE INDEX IF NOT EXISTS petros_student_threads_owner_activity_idx
  ON petros_student_threads(institution_id, student_id, last_activity_at DESC);

CREATE TABLE IF NOT EXISTS petros_student_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES petros_student_threads(id) ON DELETE CASCADE,
  role text NOT NULL,
  -- Typed PetrosCompanionBlock[]. Never raw chain-of-thought.
  blocks jsonb NOT NULL DEFAULT '[]',
  route text,
  surface text,
  focus_ref text,
  status text NOT NULL DEFAULT 'complete',
  idempotency_key uuid NOT NULL,
  prompt_version text,
  schema_version text,
  seq bigserial NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_student_messages_role_ck CHECK(role IN ('student','petros')),
  CONSTRAINT petros_student_messages_status_ck CHECK(status IN ('pending','complete','failed')),
  CONSTRAINT petros_student_messages_owner_key_role_uniq
    UNIQUE(institution_id, student_id, idempotency_key, role)
);
CREATE INDEX IF NOT EXISTS petros_student_messages_thread_seq_idx
  ON petros_student_messages(thread_id, seq);

CREATE TABLE IF NOT EXISTS petros_student_action_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES petros_student_threads(id) ON DELETE CASCADE,
  message_id uuid REFERENCES petros_student_messages(id) ON DELETE SET NULL,
  action_key text NOT NULL,
  -- Server-validated arguments only. Model output is never stored here unvalidated.
  arguments jsonb NOT NULL DEFAULT '{}',
  preview jsonb NOT NULL DEFAULT '[]',
  confirmation_required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'proposed',
  result_ref text,
  failure_reason text,
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  executed_at timestamptz,
  execution_key uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_student_action_status_ck
    CHECK(status IN ('proposed','confirmed','executed','declined','expired','failed')),
  CONSTRAINT petros_student_action_exec_key_uniq UNIQUE(institution_id, student_id, execution_key)
);
CREATE INDEX IF NOT EXISTS petros_student_action_thread_idx
  ON petros_student_action_proposals(thread_id, created_at DESC);

CREATE TABLE IF NOT EXISTS petros_student_companion_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  preferred_name text,
  response_depth text NOT NULL DEFAULT 'balanced',
  energy text NOT NULL DEFAULT 'warm',
  humour text NOT NULL DEFAULT 'light',
  proactive_check_ins boolean NOT NULL DEFAULT true,
  language text NOT NULL DEFAULT 'en',
  quiet_mode boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_student_companion_prefs_owner_uniq UNIQUE(institution_id, student_id),
  CONSTRAINT petros_student_companion_prefs_depth_ck
    CHECK(response_depth IN ('brief','balanced','thorough')),
  CONSTRAINT petros_student_companion_prefs_energy_ck CHECK(energy IN ('calm','warm','upbeat')),
  CONSTRAINT petros_student_companion_prefs_humour_ck CHECK(humour IN ('off','light','playful'))
);

-- Dismissed proactive nudges, so a dismissal is remembered rather than re-offered.
CREATE TABLE IF NOT EXISTS petros_student_nudge_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  nudge_key text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  suppress_until timestamptz NOT NULL,
  CONSTRAINT petros_student_nudge_state_owner_key_uniq UNIQUE(institution_id, student_id, nudge_key)
);

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'petros_student_threads',
    'petros_student_messages',
    'petros_student_action_proposals',
    'petros_student_companion_preferences',
    'petros_student_nudge_state'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_owner_private ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_owner_private ON %I FOR ALL USING (
        (edrion_current_student() IS NULL AND edrion_current_institution() IS NULL)
        OR (student_id::text = edrion_current_student() AND institution_id::text = edrion_current_institution())
      ) WITH CHECK (
        (edrion_current_student() IS NULL AND edrion_current_institution() IS NULL)
        OR (student_id::text = edrion_current_student() AND institution_id::text = edrion_current_institution())
      )', tbl, tbl
    );
  END LOOP;
END $$;
