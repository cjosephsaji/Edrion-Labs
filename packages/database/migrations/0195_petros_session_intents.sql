-- Stage 8: server-resolved contextual entry intents and privacy-safe origin events.
CREATE TABLE IF NOT EXISTS petros_session_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version text NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES campuses(id) ON DELETE SET NULL,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  door text NOT NULL,
  session_type text NOT NULL,
  source_entity_ids jsonb NOT NULL,
  source_fingerprint text NOT NULL,
  idempotency_key uuid NOT NULL,
  correlation_id uuid NOT NULL,
  resolved_intent jsonb NOT NULL,
  status text NOT NULL DEFAULT 'resolved',
  session_id uuid REFERENCES petros_learning_sessions(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  started_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_session_intents_owner_key_uniq UNIQUE(institution_id, student_id, idempotency_key),
  CONSTRAINT petros_session_intents_door_ck CHECK(door IN ('result_repair','upcoming_exam','uploaded_document','learning_path','assistant_handoff')),
  CONSTRAINT petros_session_intents_session_type_ck CHECK(session_type IN ('learn','revise','repair','doubt')),
  CONSTRAINT petros_session_intents_status_ck CHECK(status IN ('resolved','started','expired','invalidated'))
);
CREATE INDEX IF NOT EXISTS petros_session_intents_owner_created_idx ON petros_session_intents(institution_id,student_id,created_at);
CREATE INDEX IF NOT EXISTS petros_session_intents_source_idx ON petros_session_intents(door,created_at);
CREATE INDEX IF NOT EXISTS petros_session_intents_correlation_idx ON petros_session_intents(correlation_id);

CREATE TABLE IF NOT EXISTS petros_door_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  intent_id uuid REFERENCES petros_session_intents(id) ON DELETE SET NULL,
  session_id uuid REFERENCES petros_learning_sessions(id) ON DELETE SET NULL,
  door text NOT NULL,
  session_type text NOT NULL,
  type text NOT NULL,
  idempotency_key uuid NOT NULL,
  correlation_id uuid NOT NULL,
  duration_ms integer,
  reason_code text,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_door_events_owner_key_uniq UNIQUE(institution_id, student_id, idempotency_key),
  CONSTRAINT petros_door_events_type_ck CHECK(type IN ('impression','start','assistant_offered','assistant_accepted','completed','paused','abandoned','artifact_saved','returned','failure'))
);
CREATE INDEX IF NOT EXISTS petros_door_events_type_idx ON petros_door_events(type,created_at);
CREATE INDEX IF NOT EXISTS petros_door_events_dimensions_idx ON petros_door_events(door,session_type,created_at);
CREATE INDEX IF NOT EXISTS petros_door_events_correlation_idx ON petros_door_events(correlation_id);

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['petros_session_intents','petros_door_events'] LOOP
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

COMMENT ON TABLE petros_session_intents IS 'Versioned server-resolved Petros door context; client input is never treated as authoritative source data.';
COMMENT ON TABLE petros_door_events IS 'Content-free, idempotent Stage 8 origin events for operational and quality reconciliation.';
