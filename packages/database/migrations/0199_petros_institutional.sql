-- Stage 12: versioned institutional boundaries, stable disclosure, human handoff, privacy-safe aggregates and parent digests.
CREATE TABLE IF NOT EXISTS petros_institution_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES campuses(id) ON DELETE CASCADE,
  programme_id uuid,
  grade_id uuid REFERENCES grade_levels(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES subjects(id) ON DELETE CASCADE,
  scope_level text NOT NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  schema_version text NOT NULL,
  config jsonb NOT NULL,
  reason text NOT NULL,
  author_id uuid NOT NULL,
  supersedes_id uuid,
  effective_from timestamptz,
  effective_until timestamptz,
  published_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_policy_scope_ck CHECK(scope_level IN ('institution','campus','programme','grade','subject')),
  CONSTRAINT petros_policy_status_ck CHECK(status IN ('draft','scheduled','published','superseded','rolled_back')),
  CONSTRAINT petros_policy_version_ck CHECK(version > 0),
  CONSTRAINT petros_policy_effective_ck CHECK(effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from),
  CONSTRAINT petros_policy_scope_version_uniq UNIQUE NULLS NOT DISTINCT(institution_id,scope_level,campus_id,programme_id,grade_id,subject_id,version)
);
CREATE INDEX IF NOT EXISTS petros_policy_effective_idx ON petros_institution_policy_versions(institution_id,status,effective_from);

CREATE TABLE IF NOT EXISTS petros_policy_session_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES petros_learning_sessions(id) ON DELETE CASCADE,
  policy_version_ids uuid[] NOT NULL,
  resolved_policy jsonb NOT NULL,
  policy_hash text NOT NULL,
  stable_for_session boolean NOT NULL DEFAULT true,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_policy_session_snapshot_session_uniq UNIQUE(institution_id,student_id,session_id),
  CONSTRAINT petros_policy_session_stable_ck CHECK(stable_for_session = true),
  CONSTRAINT petros_policy_session_versions_ck CHECK(cardinality(policy_version_ids) > 0)
);
CREATE INDEX IF NOT EXISTS petros_policy_session_snapshot_version_idx ON petros_policy_session_snapshots(institution_id,policy_hash);

CREATE TABLE IF NOT EXISTS petros_policy_disclosure_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  student_id uuid NOT NULL,
  snapshot_id uuid NOT NULL UNIQUE REFERENCES petros_policy_session_snapshots(id) ON DELETE CASCADE,
  disclosure_hash text NOT NULL,
  shown_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  locale text NOT NULL DEFAULT 'en'
);
CREATE INDEX IF NOT EXISTS petros_policy_disclosure_owner_idx ON petros_policy_disclosure_receipts(institution_id,student_id,shown_at);

CREATE TABLE IF NOT EXISTS petros_homework_policy_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  student_id uuid NOT NULL,
  session_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  snapshot_id uuid NOT NULL REFERENCES petros_policy_session_snapshots(id) ON DELETE CASCADE,
  relation_basis_points integer NOT NULL,
  related boolean NOT NULL,
  active boolean NOT NULL,
  reason_code text NOT NULL,
  student_corrected boolean NOT NULL DEFAULT false,
  correction_reason text,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_homework_match_relation_ck CHECK(relation_basis_points BETWEEN 0 AND 10000),
  CONSTRAINT petros_homework_match_session_assignment_uniq UNIQUE(session_id,assignment_id)
);
CREATE INDEX IF NOT EXISTS petros_homework_match_owner_idx ON petros_homework_policy_matches(institution_id,student_id,evaluated_at);

CREATE TABLE IF NOT EXISTS petros_teacher_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES campuses(id) ON DELETE SET NULL,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES petros_learning_sessions(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  policy_snapshot_id uuid NOT NULL REFERENCES petros_policy_session_snapshots(id) ON DELETE RESTRICT,
  summary jsonb NOT NULL,
  status text NOT NULL DEFAULT 'preview',
  consented_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  cancelled_at timestamptz,
  idempotency_key uuid NOT NULL,
  function_key text NOT NULL,
  validation_passed boolean NOT NULL DEFAULT true,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_teacher_handoff_status_ck CHECK(status IN ('preview','consented','queued','delivered','read','cancelled','withdrawn','failed')),
  CONSTRAINT petros_teacher_handoff_owner_key_uniq UNIQUE(institution_id,student_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS petros_teacher_handoff_teacher_status_idx ON petros_teacher_handoffs(institution_id,teacher_id,status);

CREATE TABLE IF NOT EXISTS petros_class_struggle_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES campuses(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  concept_key text NOT NULL,
  curriculum_area text NOT NULL,
  source_hash text NOT NULL,
  cohort_size integer,
  threshold integer NOT NULL,
  evidence_count integer NOT NULL,
  uncertainty_basis_points integer NOT NULL,
  freshest_at timestamptz NOT NULL,
  suppressed boolean NOT NULL,
  suggested_next_step text NOT NULL,
  algorithm_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_class_signal_threshold_ck CHECK(threshold >= 5),
  CONSTRAINT petros_class_signal_uncertainty_ck CHECK(uncertainty_basis_points BETWEEN 0 AND 10000),
  CONSTRAINT petros_class_signal_privacy_ck CHECK((suppressed AND cohort_size IS NULL AND evidence_count = 0) OR (NOT suppressed AND cohort_size >= threshold)),
  CONSTRAINT petros_class_signal_scope_hash_uniq UNIQUE(institution_id,class_id,subject_id,concept_key,source_hash)
);
CREATE INDEX IF NOT EXISTS petros_class_signal_teacher_idx ON petros_class_struggle_signals(institution_id,class_id,subject_id,suppressed);

CREATE TABLE IF NOT EXISTS petros_parent_digest_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  guardian_user_id uuid NOT NULL REFERENCES institution_users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  opted_out boolean NOT NULL DEFAULT false,
  language text NOT NULL DEFAULT 'en',
  delivery_channels text[] NOT NULL DEFAULT ARRAY['portal']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_parent_digest_preference_uniq UNIQUE(institution_id,guardian_user_id,student_id),
  CONSTRAINT petros_parent_digest_channels_ck CHECK(cardinality(delivery_channels) BETWEEN 1 AND 2)
);

CREATE TABLE IF NOT EXISTS petros_parent_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  guardian_user_id uuid NOT NULL REFERENCES institution_users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  policy_version_ids uuid[] NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  language text NOT NULL,
  content jsonb NOT NULL,
  status text NOT NULL DEFAULT 'preview',
  delivery_channels text[] NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  max_retry_count integer NOT NULL DEFAULT 3,
  next_retry_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  error_code text,
  idempotency_key uuid NOT NULL,
  function_key text NOT NULL,
  validation_passed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_parent_digest_period_ck CHECK(period_end > period_start),
  CONSTRAINT petros_parent_digest_retry_count_ck CHECK(attempt_count >= 0 AND max_retry_count BETWEEN 0 AND 10),
  CONSTRAINT petros_parent_digest_status_ck CHECK(status IN ('preview','queued','delivered','failed','cancelled','opted_out')),
  CONSTRAINT petros_parent_digest_guardian_key_uniq UNIQUE(institution_id,guardian_user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS petros_parent_digest_history_idx ON petros_parent_digests(institution_id,guardian_user_id,student_id,period_end DESC);
CREATE INDEX IF NOT EXISTS petros_parent_digest_retry_idx ON petros_parent_digests(status,next_retry_at);

CREATE TABLE IF NOT EXISTS petros_institutional_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  actor_id uuid,
  actor_kind text NOT NULL,
  student_id uuid,
  entity_type text NOT NULL,
  entity_id uuid,
  type text NOT NULL,
  purpose text,
  function_key text,
  duration_ms integer,
  retry_count integer NOT NULL DEFAULT 0,
  fallback_tier integer,
  estimated_cost_micros integer NOT NULL DEFAULT 0,
  actual_cost_micros integer,
  validation_passed boolean NOT NULL DEFAULT true,
  error_code text,
  idempotency_key uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_institutional_event_key_uniq UNIQUE(institution_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS petros_institutional_event_type_idx ON petros_institutional_events(type,created_at);
CREATE INDEX IF NOT EXISTS petros_institutional_event_function_idx ON petros_institutional_events(function_key,created_at);

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'petros_institution_policy_versions','petros_policy_session_snapshots',
    'petros_policy_disclosure_receipts','petros_homework_policy_matches',
    'petros_teacher_handoffs','petros_class_struggle_signals',
    'petros_parent_digest_preferences','petros_parent_digests','petros_institutional_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_private ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_tenant_private ON %I FOR ALL USING (
        edrion_current_institution() IS NULL OR institution_id::text = edrion_current_institution()
      ) WITH CHECK (
        edrion_current_institution() IS NULL OR institution_id::text = edrion_current_institution()
      )', tbl, tbl
    );
  END LOOP;
END $$;

COMMENT ON TABLE petros_institution_policy_versions IS 'Audited Stage 12 policy versions with explicit scope, effective dates, preview, publish and rollback lifecycle.';
COMMENT ON TABLE petros_policy_session_snapshots IS 'Immutable policy semantics and exact student disclosure for one running Petros session.';
COMMENT ON TABLE petros_teacher_handoffs IS 'Student-controlled, evidence-linked escalation summaries routed to the assigned teacher; no hidden reasoning or provider details.';
COMMENT ON TABLE petros_class_struggle_signals IS 'Privacy-thresholded aggregate instructional signals without learner identifiers, rankings or raw answers.';
COMMENT ON TABLE petros_parent_digests IS 'Policy-bounded guardian digests with preview, opt-out, idempotent delivery, retry and cancellation.';
COMMENT ON TABLE petros_institutional_events IS 'Content-free Stage 12 policy, access, delivery, validation, fallback, cost and privacy telemetry.';
