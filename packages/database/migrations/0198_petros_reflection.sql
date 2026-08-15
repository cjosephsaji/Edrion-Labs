-- Stage 11: rebuildable, owner-private reflection derivations and content-free operations telemetry.
CREATE TABLE IF NOT EXISTS petros_reflection_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  schema_version text NOT NULL,
  algorithm_version text NOT NULL,
  source_hash text NOT NULL,
  source_through_at timestamptz,
  graph_updated_at timestamptz,
  status text NOT NULL DEFAULT 'completed',
  idempotency_key uuid NOT NULL,
  map_state_count integer NOT NULL DEFAULT 0,
  recommendation_count integer NOT NULL DEFAULT 0,
  recap_count integer NOT NULL DEFAULT 0,
  alarm_count integer NOT NULL DEFAULT 0,
  missing_syllabus_links integer NOT NULL DEFAULT 0,
  validation_failure_count integer NOT NULL DEFAULT 0,
  fallback_count integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_reflection_snapshots_status_ck CHECK(status IN ('running','completed','failed')),
  CONSTRAINT petros_reflection_snapshots_owner_version_hash_uniq UNIQUE(institution_id,student_id,algorithm_version,source_hash),
  CONSTRAINT petros_reflection_snapshots_owner_key_uniq UNIQUE(institution_id,student_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS petros_reflection_snapshots_status_idx ON petros_reflection_snapshots(status,created_at);
CREATE INDEX IF NOT EXISTS petros_reflection_snapshots_owner_time_idx ON petros_reflection_snapshots(institution_id,student_id,completed_at DESC);

CREATE TABLE IF NOT EXISTS petros_reflection_map_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES petros_reflection_snapshots(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  student_id uuid NOT NULL,
  concept_id text NOT NULL,
  topic_id text NOT NULL,
  title text NOT NULL,
  subject_label text NOT NULL,
  curriculum_label text NOT NULL,
  state text NOT NULL,
  state_explanation text NOT NULL,
  evidence_count integer NOT NULL,
  mastery_basis_points integer,
  uncertainty_basis_points integer NOT NULL,
  freshness text NOT NULL,
  evidence_age_days integer,
  last_evidence_at timestamptz,
  prerequisite_concept_ids text[] NOT NULL DEFAULT '{}',
  dependent_concept_ids text[] NOT NULL DEFAULT '{}',
  exam_relevance jsonb NOT NULL DEFAULT '{}',
  recommendation_id uuid,
  algorithm_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_reflection_map_state_ck CHECK(state IN ('solid','shaky','untouched','insufficient_evidence')),
  CONSTRAINT petros_reflection_map_freshness_ck CHECK(freshness IN ('fresh','aging','stale','none')),
  CONSTRAINT petros_reflection_map_evidence_ck CHECK(evidence_count >= 0),
  CONSTRAINT petros_reflection_map_mastery_ck CHECK(mastery_basis_points IS NULL OR mastery_basis_points BETWEEN 0 AND 10000),
  CONSTRAINT petros_reflection_map_uncertainty_ck CHECK(uncertainty_basis_points BETWEEN 0 AND 10000),
  CONSTRAINT petros_reflection_map_snapshot_concept_uniq UNIQUE(snapshot_id,concept_id)
);
CREATE INDEX IF NOT EXISTS petros_reflection_map_owner_state_idx ON petros_reflection_map_states(institution_id,student_id,state);

CREATE TABLE IF NOT EXISTS petros_reflection_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES petros_reflection_snapshots(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  student_id uuid NOT NULL,
  concept_id text NOT NULL,
  topic_id text NOT NULL,
  title text NOT NULL,
  action_label text NOT NULL,
  session_type text NOT NULL,
  score integer NOT NULL,
  reasons jsonb NOT NULL,
  why_this text NOT NULL,
  evidence_age_days integer,
  source_fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  started_intent_id uuid,
  completed_at timestamptz,
  algorithm_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_reflection_recommendation_session_ck CHECK(session_type IN ('learn','revise','repair')),
  CONSTRAINT petros_reflection_recommendation_status_ck CHECK(status IN ('active','started','completed','dismissed')),
  CONSTRAINT petros_reflection_recommendation_score_ck CHECK(score BETWEEN 0 AND 50000),
  CONSTRAINT petros_reflection_recommendation_snapshot_concept_uniq UNIQUE(snapshot_id,concept_id)
);
CREATE INDEX IF NOT EXISTS petros_reflection_recommendation_owner_status_idx ON petros_reflection_recommendations(institution_id,student_id,status);

CREATE TABLE IF NOT EXISTS petros_reflection_calibration_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL UNIQUE REFERENCES petros_reflection_snapshots(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  student_id uuid NOT NULL,
  eligible boolean NOT NULL,
  evidence_count integer NOT NULL,
  direction text NOT NULL,
  trend text NOT NULL,
  mean_confidence_basis_points integer,
  mean_outcome_basis_points integer,
  gap_basis_points integer,
  uncertainty_basis_points integer NOT NULL,
  headline text NOT NULL,
  explanation text NOT NULL,
  action_recommendation_id uuid,
  status text NOT NULL DEFAULT 'hidden',
  quiet_until timestamptz,
  algorithm_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_reflection_calibration_direction_ck CHECK(direction IN ('over','under','aligned','hidden')),
  CONSTRAINT petros_reflection_calibration_trend_ck CHECK(trend IN ('narrowing','widening','steady','insufficient_history')),
  CONSTRAINT petros_reflection_calibration_status_ck CHECK(status IN ('active','quieted','dismissed','hidden')),
  CONSTRAINT petros_reflection_calibration_evidence_ck CHECK(evidence_count >= 0),
  CONSTRAINT petros_reflection_calibration_uncertainty_ck CHECK(uncertainty_basis_points BETWEEN 0 AND 10000)
);
CREATE INDEX IF NOT EXISTS petros_reflection_calibration_owner_status_idx ON petros_reflection_calibration_insights(institution_id,student_id,status);

CREATE TABLE IF NOT EXISTS petros_reflection_session_recaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES petros_reflection_snapshots(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES petros_learning_sessions(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  student_id uuid NOT NULL,
  topic text NOT NULL,
  content jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active',
  corrected_text text,
  generation_source text NOT NULL,
  function_key text NOT NULL,
  request_id text,
  route_reference jsonb,
  validation_passed boolean NOT NULL DEFAULT true,
  closed_at timestamptz NOT NULL,
  algorithm_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_reflection_recap_status_ck CHECK(status IN ('active','corrected','dismissed')),
  CONSTRAINT petros_reflection_recap_generation_ck CHECK(generation_source IN ('deterministic','ai','deterministic_fallback')),
  CONSTRAINT petros_reflection_recap_session_version_uniq UNIQUE(session_id,algorithm_version)
);
CREATE INDEX IF NOT EXISTS petros_reflection_recap_owner_closed_idx ON petros_reflection_session_recaps(institution_id,student_id,closed_at DESC);

CREATE TABLE IF NOT EXISTS petros_reflection_gap_alarms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES petros_reflection_snapshots(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  student_id uuid NOT NULL,
  fingerprint text NOT NULL,
  content jsonb NOT NULL,
  recommendation_id uuid,
  status text NOT NULL DEFAULT 'active',
  snoozed_until timestamptz,
  resolution_reason text,
  false_positive boolean NOT NULL DEFAULT false,
  generation_source text NOT NULL,
  function_key text NOT NULL,
  request_id text,
  route_reference jsonb,
  validation_passed boolean NOT NULL DEFAULT true,
  algorithm_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_reflection_alarm_status_ck CHECK(status IN ('active','snoozed','resolved','dismissed','false_positive')),
  CONSTRAINT petros_reflection_alarm_generation_ck CHECK(generation_source IN ('deterministic','ai','deterministic_fallback')),
  CONSTRAINT petros_reflection_alarm_owner_fingerprint_uniq UNIQUE(institution_id,student_id,fingerprint,algorithm_version)
);
CREATE INDEX IF NOT EXISTS petros_reflection_alarm_owner_status_idx ON petros_reflection_gap_alarms(institution_id,student_id,status);

CREATE TABLE IF NOT EXISTS petros_reflection_evidence_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES petros_reflection_snapshots(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  student_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  label text NOT NULL,
  observed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_reflection_evidence_entity_ck CHECK(entity_type IN ('map_state','calibration','recap','alarm','recommendation')),
  CONSTRAINT petros_reflection_evidence_entity_source_uniq UNIQUE(entity_type,entity_id,source_type,source_id)
);
CREATE INDEX IF NOT EXISTS petros_reflection_evidence_owner_entity_idx ON petros_reflection_evidence_links(institution_id,student_id,entity_type,entity_id);

CREATE TABLE IF NOT EXISTS petros_reflection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  student_id uuid NOT NULL,
  snapshot_id uuid REFERENCES petros_reflection_snapshots(id) ON DELETE SET NULL,
  entity_type text,
  entity_id uuid,
  type text NOT NULL,
  function_key text,
  provider_key text,
  model_key text,
  algorithm_version text NOT NULL,
  schema_version text NOT NULL,
  duration_ms integer,
  retry_count integer NOT NULL DEFAULT 0,
  fallback_tier integer,
  estimated_cost_micros integer NOT NULL DEFAULT 0,
  actual_cost_micros integer,
  validation_passed boolean NOT NULL DEFAULT true,
  error_code text,
  idempotency_key uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_reflection_events_owner_key_uniq UNIQUE(institution_id,student_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS petros_reflection_events_type_time_idx ON petros_reflection_events(type,created_at);
CREATE INDEX IF NOT EXISTS petros_reflection_events_function_time_idx ON petros_reflection_events(function_key,created_at);

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'petros_reflection_snapshots','petros_reflection_map_states',
    'petros_reflection_recommendations','petros_reflection_calibration_insights',
    'petros_reflection_session_recaps','petros_reflection_gap_alarms',
    'petros_reflection_evidence_links','petros_reflection_events'
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

COMMENT ON TABLE petros_reflection_map_states IS 'Rebuildable Stage 11 knowledge-map states with explicit evidence sufficiency, uncertainty, and freshness.';
COMMENT ON TABLE petros_reflection_session_recaps IS 'Owner-private session-process recaps; observed facts and tentative inference remain structurally separate.';
COMMENT ON TABLE petros_reflection_gap_alarms IS 'Deduplicated prerequisite hypotheses from deterministic graph candidates; never permanent ability labels.';
COMMENT ON TABLE petros_reflection_events IS 'Content-free Stage 11 rebuild, lifecycle, routing, validation, latency, cost, and false-positive telemetry.';
