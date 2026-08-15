-- Stage 9: secure multimodal ingestion, processing jobs, and content-free operations events.
CREATE TABLE IF NOT EXISTS petros_media_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version text NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  storage_object_id uuid REFERENCES storage_objects(id) ON DELETE SET NULL,
  session_id uuid REFERENCES petros_learning_sessions(id) ON DELETE SET NULL,
  kind text NOT NULL,
  mode text NOT NULL,
  state text NOT NULL DEFAULT 'upload_intent',
  filename text NOT NULL,
  declared_mime_type text NOT NULL,
  detected_mime_type text,
  size_bytes integer NOT NULL,
  duration_ms integer,
  width integer,
  height integer,
  page_index integer NOT NULL DEFAULT 0,
  transform jsonb NOT NULL DEFAULT '{}',
  checksum_sha256 text,
  duplicate_of uuid,
  scan_status text NOT NULL DEFAULT 'pending',
  structured_result jsonb NOT NULL DEFAULT '{}',
  correction_audit jsonb NOT NULL DEFAULT '{}',
  failure_code text,
  idempotency_key uuid NOT NULL,
  correlation_id uuid NOT NULL,
  upload_expires_at timestamptz NOT NULL,
  raw_media_expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_media_objects_owner_key_uniq UNIQUE(institution_id,student_id,idempotency_key),
  CONSTRAINT petros_media_objects_kind_ck CHECK(kind IN ('question_photo','handwriting_page','voice_turn')),
  CONSTRAINT petros_media_objects_mode_ck CHECK(mode IN ('snap_question','handwriting','voice')),
  CONSTRAINT petros_media_objects_state_ck CHECK(state IN ('upload_intent','uploaded','scanning','quarantined','ready_for_processing','processing','needs_confirmation','ready','session_created','retryable_failure','failed','cancelled','expired','deleted')),
  CONSTRAINT petros_media_objects_scan_ck CHECK(scan_status IN ('pending','running','clean','unsafe','failed')),
  CONSTRAINT petros_media_objects_size_ck CHECK(size_bytes > 0),
  CONSTRAINT petros_media_objects_page_ck CHECK(page_index BETWEEN 0 AND 19)
);
CREATE INDEX IF NOT EXISTS petros_media_objects_owner_created_idx ON petros_media_objects(institution_id,student_id,created_at);
CREATE INDEX IF NOT EXISTS petros_media_objects_state_expiry_idx ON petros_media_objects(state,raw_media_expires_at);
CREATE INDEX IF NOT EXISTS petros_media_objects_hash_idx ON petros_media_objects(institution_id,student_id,checksum_sha256);
CREATE INDEX IF NOT EXISTS petros_media_objects_session_idx ON petros_media_objects(session_id);
CREATE INDEX IF NOT EXISTS petros_media_objects_correlation_idx ON petros_media_objects(correlation_id);

CREATE TABLE IF NOT EXISTS petros_media_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES petros_media_objects(id) ON DELETE CASCADE,
  kind text NOT NULL,
  state text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  idempotency_key uuid NOT NULL,
  function_key text,
  provider_request_id text,
  output jsonb NOT NULL DEFAULT '{}',
  confidence_basis_points integer,
  error_code text,
  next_attempt_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_media_jobs_media_key_uniq UNIQUE(media_id,idempotency_key),
  CONSTRAINT petros_media_jobs_kind_ck CHECK(kind IN ('scan','image_understanding','question_extraction','handwriting_recognition','work_evaluation','speech_transcription','spoken_interaction','speech_synthesis','cleanup')),
  CONSTRAINT petros_media_jobs_state_ck CHECK(state IN ('queued','running','needs_confirmation','completed','retryable_failure','failed','cancelled')),
  CONSTRAINT petros_media_jobs_attempts_ck CHECK(attempts >= 0 AND max_attempts BETWEEN 1 AND 5),
  CONSTRAINT petros_media_jobs_confidence_ck CHECK(confidence_basis_points IS NULL OR confidence_basis_points BETWEEN 0 AND 10000)
);
CREATE INDEX IF NOT EXISTS petros_media_jobs_state_attempt_idx ON petros_media_jobs(state,next_attempt_at);
CREATE INDEX IF NOT EXISTS petros_media_jobs_owner_idx ON petros_media_jobs(institution_id,student_id,created_at);

CREATE TABLE IF NOT EXISTS petros_modality_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  media_id uuid REFERENCES petros_media_objects(id) ON DELETE SET NULL,
  session_id uuid REFERENCES petros_learning_sessions(id) ON DELETE SET NULL,
  mode text NOT NULL,
  type text NOT NULL,
  stage text,
  function_key text,
  provider_key text,
  model_key text,
  cache_hit boolean NOT NULL DEFAULT false,
  idempotency_key uuid NOT NULL,
  correlation_id uuid NOT NULL,
  duration_ms integer,
  media_units jsonb NOT NULL DEFAULT '{}',
  estimated_cost_micros integer NOT NULL DEFAULT 0,
  actual_cost_micros integer,
  retry_count integer NOT NULL DEFAULT 0,
  fallback_tier integer,
  confidence_basis_points integer,
  error_code text,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_modality_events_owner_key_uniq UNIQUE(institution_id,student_id,idempotency_key),
  CONSTRAINT petros_modality_events_mode_ck CHECK(mode IN ('snap_question','handwriting','voice','five_minute')),
  CONSTRAINT petros_modality_events_confidence_ck CHECK(confidence_basis_points IS NULL OR confidence_basis_points BETWEEN 0 AND 10000)
);
CREATE INDEX IF NOT EXISTS petros_modality_events_mode_time_idx ON petros_modality_events(mode,created_at);
CREATE INDEX IF NOT EXISTS petros_modality_events_stage_time_idx ON petros_modality_events(stage,created_at);
CREATE INDEX IF NOT EXISTS petros_modality_events_function_time_idx ON petros_modality_events(function_key,created_at);
CREATE INDEX IF NOT EXISTS petros_modality_events_correlation_idx ON petros_modality_events(correlation_id);

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['petros_media_objects','petros_media_jobs','petros_modality_events'] LOOP
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

COMMENT ON TABLE petros_media_objects IS 'Owner-private Stage 9 media lifecycle metadata. Raw media remains in object storage and is never exposed to operations dashboards.';
COMMENT ON TABLE petros_media_jobs IS 'Bounded, cancellable Stage 9 processing state machine with provider-neutral function references.';
COMMENT ON TABLE petros_modality_events IS 'Content-free Stage 9 modality, latency, cost, retry, confidence, correction, and cleanup telemetry.';
