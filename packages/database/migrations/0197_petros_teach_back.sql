-- Stage 10: reversed Teach-it-back session state, grounded follow-ups, verdicts, and aggregate traces.
CREATE TABLE IF NOT EXISTS petros_teach_back_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_session_id uuid NOT NULL UNIQUE REFERENCES petros_learning_sessions(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  state_version text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  topic text NOT NULL,
  scope text,
  audience_level text NOT NULL,
  audience_label text NOT NULL,
  mode text NOT NULL,
  language text NOT NULL,
  coverage_checklist jsonb NOT NULL DEFAULT '[]',
  current_gap_type text NOT NULL DEFAULT 'none',
  current_gap_fingerprint text,
  probes_on_current_gap integer NOT NULL DEFAULT 0,
  moves_used integer NOT NULL DEFAULT 0,
  max_moves integer NOT NULL,
  time_budget_seconds integer NOT NULL,
  elapsed_seconds integer NOT NULL DEFAULT 0,
  active_since timestamptz,
  help_use_count integer NOT NULL DEFAULT 0,
  verdict jsonb,
  artifact_bundle_id uuid,
  repeated_from_session_id uuid,
  close_reason text,
  closed_at timestamptz,
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_teach_back_sessions_status_ck CHECK(status IN ('active','paused','closed')),
  CONSTRAINT petros_teach_back_sessions_mode_ck CHECK(mode IN ('text','voice')),
  CONSTRAINT petros_teach_back_sessions_audience_ck CHECK(audience_level IN ('younger_student','classmate','beginner_adult')),
  CONSTRAINT petros_teach_back_sessions_gap_ck CHECK(current_gap_type IN ('missing_causal_link','undefined_term','unhandled_exception','weak_example','contradiction','misconception','scope_gap','none')),
  CONSTRAINT petros_teach_back_sessions_probe_ck CHECK(probes_on_current_gap BETWEEN 0 AND 2),
  CONSTRAINT petros_teach_back_sessions_budget_ck CHECK(max_moves BETWEEN 2 AND 12 AND time_budget_seconds BETWEEN 300 AND 1800)
);
CREATE INDEX IF NOT EXISTS petros_teach_back_sessions_owner_created_idx ON petros_teach_back_sessions(institution_id,student_id,created_at);
CREATE INDEX IF NOT EXISTS petros_teach_back_sessions_status_idx ON petros_teach_back_sessions(status,updated_at);
CREATE INDEX IF NOT EXISTS petros_teach_back_sessions_repeat_idx ON petros_teach_back_sessions(repeated_from_session_id);

CREATE TABLE IF NOT EXISTS petros_teach_back_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teach_back_session_id uuid NOT NULL REFERENCES petros_teach_back_sessions(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  source text NOT NULL,
  text text NOT NULL,
  original_text_hash text NOT NULL,
  corrected boolean NOT NULL DEFAULT false,
  correction_count integer NOT NULL DEFAULT 0,
  media_id uuid REFERENCES petros_media_objects(id) ON DELETE SET NULL,
  transcription_confidence_basis_points integer,
  response_to_follow_up_id uuid,
  analysis jsonb NOT NULL,
  analysis_function_key text NOT NULL,
  analysis_request_id text,
  analysis_route_reference jsonb,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_teach_back_segments_ordinal_uniq UNIQUE(teach_back_session_id,ordinal),
  CONSTRAINT petros_teach_back_segments_source_ck CHECK(source IN ('text','voice')),
  CONSTRAINT petros_teach_back_segments_confidence_ck CHECK(transcription_confidence_basis_points IS NULL OR transcription_confidence_basis_points BETWEEN 0 AND 10000)
);
CREATE INDEX IF NOT EXISTS petros_teach_back_segments_owner_idx ON petros_teach_back_segments(institution_id,student_id,created_at);
CREATE INDEX IF NOT EXISTS petros_teach_back_segments_media_idx ON petros_teach_back_segments(media_id);

CREATE TABLE IF NOT EXISTS petros_teach_back_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teach_back_session_id uuid NOT NULL REFERENCES petros_teach_back_sessions(id) ON DELETE CASCADE,
  segment_id uuid NOT NULL REFERENCES petros_teach_back_segments(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open',
  gap_type text NOT NULL,
  gap_fingerprint text NOT NULL,
  probe_number integer NOT NULL,
  content jsonb NOT NULL,
  function_key text NOT NULL,
  provider_request_id text,
  route_reference jsonb,
  correlation_id uuid NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_teach_back_follow_ups_status_ck CHECK(status IN ('open','answered','helped','skipped')),
  CONSTRAINT petros_teach_back_follow_ups_probe_ck CHECK(probe_number BETWEEN 1 AND 2)
);
CREATE INDEX IF NOT EXISTS petros_teach_back_follow_ups_session_idx ON petros_teach_back_follow_ups(teach_back_session_id,created_at);
CREATE INDEX IF NOT EXISTS petros_teach_back_follow_ups_open_idx ON petros_teach_back_follow_ups(status,created_at);
CREATE INDEX IF NOT EXISTS petros_teach_back_follow_ups_owner_idx ON petros_teach_back_follow_ups(institution_id,student_id,created_at);

CREATE TABLE IF NOT EXISTS petros_teach_back_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teach_back_session_id uuid NOT NULL REFERENCES petros_teach_back_sessions(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  student_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'started',
  response jsonb,
  error_code text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_teach_back_commands_owner_key_uniq UNIQUE(institution_id,student_id,idempotency_key),
  CONSTRAINT petros_teach_back_commands_status_ck CHECK(status IN ('started','completed','failed'))
);

CREATE TABLE IF NOT EXISTS petros_teach_back_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teach_back_session_id uuid NOT NULL REFERENCES petros_teach_back_sessions(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  student_id uuid NOT NULL,
  segment_id uuid REFERENCES petros_teach_back_segments(id) ON DELETE SET NULL,
  follow_up_id uuid REFERENCES petros_teach_back_follow_ups(id) ON DELETE SET NULL,
  artifact_block_id uuid REFERENCES petros_teaching_blocks(id) ON DELETE SET NULL,
  type text NOT NULL,
  mode text NOT NULL,
  gap_type text,
  function_key text,
  provider_key text,
  model_key text,
  duration_ms integer,
  estimated_cost_micros integer NOT NULL DEFAULT 0,
  actual_cost_micros integer,
  retry_count integer NOT NULL DEFAULT 0,
  fallback_tier integer,
  validation_passed boolean NOT NULL DEFAULT true,
  uncertainty_basis_points integer,
  error_code text,
  idempotency_key uuid NOT NULL,
  correlation_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_teach_back_events_owner_key_uniq UNIQUE(institution_id,student_id,idempotency_key),
  CONSTRAINT petros_teach_back_events_mode_ck CHECK(mode IN ('text','voice'))
);
CREATE INDEX IF NOT EXISTS petros_teach_back_events_type_time_idx ON petros_teach_back_events(type,created_at);
CREATE INDEX IF NOT EXISTS petros_teach_back_events_function_time_idx ON petros_teach_back_events(function_key,created_at);
CREATE INDEX IF NOT EXISTS petros_teach_back_events_correlation_idx ON petros_teach_back_events(correlation_id);

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['petros_teach_back_sessions','petros_teach_back_segments','petros_teach_back_follow_ups','petros_teach_back_commands','petros_teach_back_events'] LOOP
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

COMMENT ON TABLE petros_teach_back_sessions IS 'Owner-private Stage 10 reversed-session state; verdicts are nonnumeric and never mutate official assessment.';
COMMENT ON TABLE petros_teach_back_segments IS 'Student explanation segments and corrected voice transcripts; concise analysis only, no hidden reasoning.';
COMMENT ON TABLE petros_teach_back_events IS 'Content-free Stage 10 product, function, validation, latency, cost, retry, fallback, and policy telemetry.';
