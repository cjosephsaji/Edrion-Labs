-- Stage 6: append-oriented learner evidence, rebuildable summaries, PLAN snapshots, and jobs.
-- Scale convention: all mastery/confidence/uncertainty/effect values use integer basis points
-- in [0,10000]. Raw evidence is never overwritten by a rebuild or algorithm rollback.

CREATE TABLE IF NOT EXISTS petros_learner_evidence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE, source text NOT NULL,
  source_event_id text NOT NULL, source_record_id text, concept_id text NOT NULL, topic_id text NOT NULL,
  prerequisite_concept_ids text[] NOT NULL DEFAULT '{}', evidence_kind text NOT NULL, outcome text NOT NULL,
  credit_basis_points integer NOT NULL CHECK (credit_basis_points BETWEEN 0 AND 10000), move_type text,
  profile_dimension text, pre_evidence_basis_points integer, post_evidence_basis_points integer,
  response_time_ms integer, hint_count integer NOT NULL DEFAULT 0, confidence_before text, confidence_after text,
  error_category text NOT NULL DEFAULT 'unclassified', error_confidence_basis_points integer NOT NULL DEFAULT 0,
  classification_status text NOT NULL DEFAULT 'ready', evaluator_version text, algorithm_version text NOT NULL,
  schema_version text NOT NULL, environment text NOT NULL DEFAULT 'production', synthetic boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL, ingested_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_learner_evidence_source_event_uniq UNIQUE (institution_id, student_id, source, source_event_id),
  CONSTRAINT petros_learner_evidence_environment_ck CHECK (environment IN ('production','evaluation')),
  CONSTRAINT petros_learner_evidence_synthetic_ck CHECK (NOT synthetic OR environment = 'evaluation')
);
CREATE INDEX IF NOT EXISTS petros_learner_evidence_owner_time_idx ON petros_learner_evidence_events(institution_id,student_id,occurred_at);
CREATE INDEX IF NOT EXISTS petros_learner_evidence_concept_time_idx ON petros_learner_evidence_events(institution_id,student_id,concept_id,occurred_at);
CREATE INDEX IF NOT EXISTS petros_learner_evidence_source_idx ON petros_learner_evidence_events(source,occurred_at);
CREATE INDEX IF NOT EXISTS petros_learner_evidence_classifier_idx ON petros_learner_evidence_events(classification_status,ingested_at);

CREATE TABLE IF NOT EXISTS petros_learner_evidence_quarantine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  evidence_event_id uuid REFERENCES petros_learner_evidence_events(id) ON DELETE CASCADE, source_event_id text NOT NULL,
  reason_code text NOT NULL, failure_detail text NOT NULL, status text NOT NULL DEFAULT 'pending', retry_count integer NOT NULL DEFAULT 0,
  evaluator_version text, next_retry_at timestamptz, resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS petros_learner_quarantine_owner_status_idx ON petros_learner_evidence_quarantine(institution_id,student_id,status);

CREATE TABLE IF NOT EXISTS petros_learner_concept_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE, concept_id text NOT NULL, topic_id text NOT NULL,
  prerequisite_concept_ids text[] NOT NULL DEFAULT '{}', mastery_basis_points integer NOT NULL,
  recall_basis_points integer NOT NULL, application_basis_points integer NOT NULL, confidence_basis_points integer NOT NULL,
  uncertainty_basis_points integer NOT NULL, evidence_count integer NOT NULL, evidence_sources jsonb NOT NULL DEFAULT '{}',
  last_touched_at timestamptz NOT NULL, decay_anchor_at timestamptz NOT NULL, next_review_at timestamptz,
  last_update_event_id uuid REFERENCES petros_learner_evidence_events(id) ON DELETE SET NULL,
  algorithm_version text NOT NULL, rebuilt_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_learner_mastery_concept_version_uniq UNIQUE(institution_id,student_id,concept_id,algorithm_version)
);
CREATE INDEX IF NOT EXISTS petros_learner_mastery_topic_idx ON petros_learner_concept_mastery(institution_id,student_id,topic_id);
CREATE INDEX IF NOT EXISTS petros_learner_mastery_review_idx ON petros_learner_concept_mastery(next_review_at);

CREATE TABLE IF NOT EXISTS petros_learner_move_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE, move_type text NOT NULL, topic_id text NOT NULL DEFAULT '*',
  profile_dimension text NOT NULL DEFAULT '*', successes integer NOT NULL, failures integer NOT NULL, skips integer NOT NULL,
  sample_size integer NOT NULL, mean_pre_basis_points integer NOT NULL, mean_post_basis_points integer NOT NULL,
  mean_response_time_ms integer NOT NULL, hint_uses integer NOT NULL, confidence_change_basis_points integer NOT NULL,
  effectiveness_basis_points integer NOT NULL, confidence_basis_points integer NOT NULL, uncertainty_basis_points integer NOT NULL,
  recency_weight_basis_points integer NOT NULL, last_evidence_at timestamptz NOT NULL, algorithm_version text NOT NULL,
  rebuilt_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_learner_move_dimension_version_uniq UNIQUE(institution_id,student_id,move_type,topic_id,profile_dimension,algorithm_version)
);
CREATE INDEX IF NOT EXISTS petros_learner_move_owner_idx ON petros_learner_move_outcomes(institution_id,student_id,last_evidence_at);

CREATE TABLE IF NOT EXISTS petros_learner_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE, pace text NOT NULL, depth text NOT NULL,
  skip_count integer NOT NULL, expand_count integer NOT NULL, read_count integer NOT NULL, response_count integer NOT NULL,
  mean_response_time_ms integer NOT NULL, evidence_count integer NOT NULL, confidence_basis_points integer NOT NULL,
  minimum_evidence_met boolean NOT NULL, algorithm_version text NOT NULL, rebuilt_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_learner_preferences_owner_version_uniq UNIQUE(institution_id,student_id,algorithm_version)
);

CREATE TABLE IF NOT EXISTS petros_learner_error_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE, category text NOT NULL, topic_id text NOT NULL DEFAULT '*',
  count integer NOT NULL, contexts text[] NOT NULL DEFAULT '{}', confidence_basis_points integer NOT NULL,
  evidence_event_ids uuid[] NOT NULL DEFAULT '{}', last_evidence_at timestamptz NOT NULL, evaluator_version text,
  algorithm_version text NOT NULL, rebuilt_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_learner_error_category_version_uniq UNIQUE(institution_id,student_id,category,topic_id,algorithm_version)
);

CREATE TABLE IF NOT EXISTS petros_learner_calibration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE, buckets jsonb NOT NULL, score_basis_points integer NOT NULL,
  uncertainty_basis_points integer NOT NULL, evidence_count integer NOT NULL, algorithm_version text NOT NULL,
  rebuilt_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_learner_calibration_owner_version_uniq UNIQUE(institution_id,student_id,algorithm_version)
);

CREATE TABLE IF NOT EXISTS petros_learner_plan_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES petros_learning_sessions(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL REFERENCES petros_planning_decisions(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE, student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  topic_id text NOT NULL, snapshot jsonb NOT NULL, causal_factors text[] NOT NULL DEFAULT '{}', algorithm_version text NOT NULL,
  schema_version text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_learner_plan_snapshot_decision_uniq UNIQUE(decision_id)
);
CREATE INDEX IF NOT EXISTS petros_learner_plan_snapshot_owner_idx ON petros_learner_plan_snapshots(institution_id,student_id,created_at);

CREATE TABLE IF NOT EXISTS petros_learner_model_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE, kind text NOT NULL DEFAULT 'rebuild', status text NOT NULL DEFAULT 'queued',
  algorithm_version text NOT NULL, batch_size integer NOT NULL DEFAULT 100, total_events integer NOT NULL DEFAULT 0,
  processed_events integer NOT NULL DEFAULT 0, failed_events integer NOT NULL DEFAULT 0, retry_count integer NOT NULL DEFAULT 0,
  reason text NOT NULL, requested_by text NOT NULL, cancellation_requested boolean NOT NULL DEFAULT false,
  before_hash text, after_hash text, error_code text, error_detail text, started_at timestamptz, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS petros_learner_jobs_owner_status_idx ON petros_learner_model_jobs(institution_id,student_id,status,created_at);

COMMENT ON TABLE petros_learner_evidence_events IS 'Append-oriented normalized learning evidence; evaluation/synthetic rows are rejected by the service and excluded from summaries.';
COMMENT ON TABLE petros_learner_concept_mastery IS 'Rebuildable 0..10000 concept mastery with uncertainty, recall/application evidence, decay, and version provenance.';
COMMENT ON TABLE petros_learner_plan_snapshots IS 'Exact bounded learner facts and concise causal factors supplied to a PLAN decision; never chain-of-thought.';
