-- Stage 7: learner-owned artifacts. AI proposals remain isolated from searchable/owned products.
CREATE TABLE IF NOT EXISTS petros_artifact_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE, session_id uuid NOT NULL REFERENCES petros_learning_sessions(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'open', version integer NOT NULL DEFAULT 0, forward_link text, expires_at timestamptz, discarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_artifact_bundles_session_uniq UNIQUE(session_id),
  CONSTRAINT petros_artifact_bundles_state_ck CHECK(state IN ('open','partially_saved','saved','discarded'))
);
CREATE INDEX IF NOT EXISTS petros_artifact_bundles_owner_idx ON petros_artifact_bundles(institution_id,student_id,created_at);
CREATE INDEX IF NOT EXISTS petros_artifact_bundles_state_idx ON petros_artifact_bundles(state,updated_at);

CREATE TABLE IF NOT EXISTS petros_saved_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), portable_id uuid NOT NULL UNIQUE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE, student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id uuid REFERENCES petros_learning_sessions(id) ON DELETE SET NULL, bundle_id uuid REFERENCES petros_artifact_bundles(id) ON DELETE SET NULL,
  source_proposal_id uuid, kind text NOT NULL, lifecycle text NOT NULL DEFAULT 'saved', content jsonb NOT NULL, sources jsonb NOT NULL DEFAULT '[]',
  product_type text NOT NULL, product_target_id uuid NOT NULL, content_version text NOT NULL, prompt_version text NOT NULL, schema_version text NOT NULL,
  revision integer NOT NULL DEFAULT 1, due_at timestamptz, interval_minutes integer, ease_basis_points integer, review_reps integer NOT NULL DEFAULT 0,
  review_lapses integer NOT NULL DEFAULT 0, scheduler_version text, exam_date date, exam_aware boolean NOT NULL DEFAULT false,
  paused_at timestamptz, archived_at timestamptz, deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_saved_artifacts_kind_ck CHECK(kind IN ('flashcard','rule_card','diagram','note')),
  CONSTRAINT petros_saved_artifacts_lifecycle_ck CHECK(lifecycle IN ('saved','archived','deleted')),
  CONSTRAINT petros_saved_artifacts_product_uniq UNIQUE(product_type,product_target_id),
  CONSTRAINT petros_saved_artifacts_proposal_uniq UNIQUE(source_proposal_id)
);
CREATE INDEX IF NOT EXISTS petros_saved_artifacts_owner_idx ON petros_saved_artifacts(institution_id,student_id,created_at);
CREATE INDEX IF NOT EXISTS petros_saved_artifacts_due_idx ON petros_saved_artifacts(institution_id,student_id,due_at);

CREATE TABLE IF NOT EXISTS petros_artifact_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bundle_id uuid NOT NULL REFERENCES petros_artifact_bundles(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE, student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind text NOT NULL, state text NOT NULL DEFAULT 'proposed', selected boolean NOT NULL DEFAULT false,
  original_content jsonb NOT NULL, content jsonb NOT NULL, sources jsonb NOT NULL DEFAULT '[]', generation_function_key text NOT NULL,
  prompt_version text NOT NULL, schema_version text NOT NULL, version integer NOT NULL DEFAULT 0,
  saved_artifact_id uuid REFERENCES petros_saved_artifacts(id) ON DELETE SET NULL, failure_code text, edited_at timestamptz,
  saved_at timestamptz, discarded_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_artifact_proposals_kind_ck CHECK(kind IN ('flashcard','rule_card','diagram','note')),
  CONSTRAINT petros_artifact_proposals_state_ck CHECK(state IN ('proposed','edited','saved','discarded','failed'))
);
ALTER TABLE petros_saved_artifacts DROP CONSTRAINT IF EXISTS petros_saved_artifacts_source_proposal_fk;
ALTER TABLE petros_saved_artifacts ADD CONSTRAINT petros_saved_artifacts_source_proposal_fk FOREIGN KEY(source_proposal_id) REFERENCES petros_artifact_proposals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS petros_artifact_proposals_bundle_idx ON petros_artifact_proposals(bundle_id,created_at);
CREATE INDEX IF NOT EXISTS petros_artifact_proposals_owner_state_idx ON petros_artifact_proposals(institution_id,student_id,state);

CREATE TABLE IF NOT EXISTS petros_artifact_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), artifact_id uuid NOT NULL REFERENCES petros_saved_artifacts(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE, student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  revision integer NOT NULL, content jsonb NOT NULL, sources jsonb NOT NULL DEFAULT '[]', reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT petros_artifact_revisions_artifact_revision_uniq UNIQUE(artifact_id,revision)
);
CREATE INDEX IF NOT EXISTS petros_artifact_revisions_owner_idx ON petros_artifact_revisions(institution_id,student_id,created_at);

CREATE TABLE IF NOT EXISTS petros_artifact_commit_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bundle_id uuid NOT NULL REFERENCES petros_artifact_bundles(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE, student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL, status text NOT NULL DEFAULT 'in_progress', response jsonb, error_code text, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_artifact_commit_commands_owner_key_uniq UNIQUE(institution_id,student_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS petros_artifact_review_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), artifact_id uuid NOT NULL REFERENCES petros_saved_artifacts(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE, student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  client_review_id uuid NOT NULL, grade text NOT NULL, confidence text NOT NULL, state_before jsonb NOT NULL, state_after jsonb NOT NULL,
  scheduler_version text NOT NULL, exam_aware boolean NOT NULL DEFAULT false, elapsed_ms integer, reviewed_at timestamptz NOT NULL,
  learner_evidence_event_id text, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_artifact_review_outcomes_client_uniq UNIQUE(institution_id,student_id,client_review_id),
  CONSTRAINT petros_artifact_review_grade_ck CHECK(grade IN ('again','hard','good','easy')),
  CONSTRAINT petros_artifact_review_confidence_ck CHECK(confidence IN ('sure','think_so','guessing'))
);
CREATE INDEX IF NOT EXISTS petros_artifact_review_outcomes_artifact_idx ON petros_artifact_review_outcomes(artifact_id,reviewed_at);

CREATE TABLE IF NOT EXISTS petros_artifact_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE, session_id uuid REFERENCES petros_learning_sessions(id) ON DELETE SET NULL,
  bundle_id uuid REFERENCES petros_artifact_bundles(id) ON DELETE SET NULL, proposal_id uuid REFERENCES petros_artifact_proposals(id) ON DELETE SET NULL,
  artifact_id uuid REFERENCES petros_saved_artifacts(id) ON DELETE SET NULL, type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS petros_artifact_events_owner_idx ON petros_artifact_events(institution_id,student_id,created_at);
CREATE INDEX IF NOT EXISTS petros_artifact_events_type_idx ON petros_artifact_events(type,created_at);

CREATE TABLE IF NOT EXISTS petros_artifact_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE, kind text NOT NULL, status text NOT NULL DEFAULT 'queued',
  options jsonb NOT NULL DEFAULT '{}', result jsonb, error_code text, started_at timestamptz, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS petros_artifact_jobs_owner_status_idx ON petros_artifact_jobs(institution_id,student_id,status,created_at);

-- Owner isolation is additive to service-layer institution/student predicates. Unscoped maintenance
-- connections retain access for migrations and explicitly audited platform operations.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'petros_artifact_bundles','petros_saved_artifacts','petros_artifact_proposals','petros_artifact_revisions',
    'petros_artifact_commit_commands','petros_artifact_review_outcomes','petros_artifact_events','petros_artifact_jobs'
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

COMMENT ON TABLE petros_artifact_proposals IS 'AI-proposed, learner-editable drafts; never indexed, exported, counted as owned, or scheduled.';
COMMENT ON TABLE petros_saved_artifacts IS 'Portable learner-owned metadata/provenance linked to existing deck, note, and canvas products after explicit save.';
