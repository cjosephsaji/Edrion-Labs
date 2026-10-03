-- Phase 2 typed objective evidence and explicit qualitative review receipts.
-- The feature is default-off. No evidence, qualification or approval rows are seeded.

CREATE TABLE petros_objective_evidence_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id uuid NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES petros_learning_sessions(id) ON DELETE CASCADE,
  evaluation_id uuid NOT NULL REFERENCES petros_answer_evaluations(id) ON DELETE RESTRICT,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  event_id uuid NOT NULL UNIQUE,
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object' AND pg_column_size(response) <= 131072),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_objective_evidence_commands_owner_command_uq
    UNIQUE (institution_id, student_id, command_id)
);
CREATE INDEX petros_objective_evidence_commands_owner_created_idx
  ON petros_objective_evidence_commands(institution_id, student_id, created_at);

CREATE TABLE petros_objective_evidence_events (
  id uuid PRIMARY KEY,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES petros_learning_sessions(id) ON DELETE CASCADE,
  command_id uuid NOT NULL,
  evaluation_id uuid NOT NULL REFERENCES petros_answer_evaluations(id) ON DELETE RESTRICT,
  objective_id uuid NOT NULL,
  objective_version integer NOT NULL CHECK (objective_version BETWEEN 1 AND 100000),
  pack_id uuid NOT NULL,
  pack_version integer NOT NULL CHECK (pack_version BETWEEN 1 AND 100000),
  corrects_event_id uuid REFERENCES petros_objective_evidence_events(id) ON DELETE RESTRICT,
  correction_reason text,
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object' AND pg_column_size(evidence) <= 131072),
  classification jsonb NOT NULL CHECK (jsonb_typeof(classification) = 'object' AND pg_column_size(classification) <= 16384),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_objective_evidence_correction_shape CHECK (
    (corrects_event_id IS NULL AND correction_reason IS NULL) OR
    (corrects_event_id IS NOT NULL AND length(correction_reason) BETWEEN 8 AND 600)
  ),
  CONSTRAINT petros_objective_evidence_events_owner_command_uq
    UNIQUE (institution_id, student_id, command_id)
);
CREATE INDEX petros_objective_evidence_events_owner_objective_idx
  ON petros_objective_evidence_events(institution_id, student_id, objective_id, objective_version, occurred_at);
CREATE INDEX petros_objective_evidence_events_session_idx
  ON petros_objective_evidence_events(session_id, occurred_at);
CREATE UNIQUE INDEX petros_objective_evidence_events_owner_evaluation_uniq
  ON petros_objective_evidence_events(institution_id, student_id, evaluation_id);
CREATE UNIQUE INDEX petros_objective_evidence_events_corrected_once_uniq
  ON petros_objective_evidence_events(corrects_event_id) WHERE corrects_event_id IS NOT NULL;
ALTER TABLE petros_objective_evidence_commands ADD CONSTRAINT petros_objective_evidence_command_event_fk
  FOREIGN KEY (event_id) REFERENCES petros_objective_evidence_events(id) ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE petros_objective_evidence_events ADD CONSTRAINT petros_objective_evidence_event_command_fk
  FOREIGN KEY (institution_id, student_id, command_id)
  REFERENCES petros_objective_evidence_commands(institution_id, student_id, command_id) ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE petros_objective_evidence_outbox (
  id uuid PRIMARY KEY,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  event_id uuid NOT NULL UNIQUE REFERENCES petros_objective_evidence_events(id) ON DELETE RESTRICT,
  topic text NOT NULL CHECK (topic = 'petros.objective-evidence.appended.v1'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 8192),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 100),
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX petros_objective_evidence_outbox_pending_idx
  ON petros_objective_evidence_outbox(status, available_at);

CREATE TABLE petros_objective_evidence_projections (
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  objective_id uuid NOT NULL,
  objective_version integer NOT NULL CHECK (objective_version BETWEEN 1 AND 100000),
  projection jsonb NOT NULL CHECK (jsonb_typeof(projection) = 'object' AND pg_column_size(projection) <= 16384),
  projection_hash text NOT NULL CHECK (projection_hash ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_objective_evidence_projections_pk PRIMARY KEY
    (institution_id, student_id, objective_id, objective_version)
);

CREATE TABLE petros_qualitative_submissions (
  id uuid PRIMARY KEY,
  command_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES petros_learning_sessions(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES petros_saved_artifacts(id) ON DELETE RESTRICT,
  revision_id uuid NOT NULL REFERENCES petros_artifact_revisions(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision BETWEEN 1 AND 100000),
  objective_id uuid NOT NULL,
  objective_version integer NOT NULL CHECK (objective_version BETWEEN 1 AND 100000),
  pack_id uuid NOT NULL,
  pack_version integer NOT NULL CHECK (pack_version BETWEEN 1 AND 100000),
  submission jsonb NOT NULL CHECK (jsonb_typeof(submission) = 'object' AND pg_column_size(submission) <= 196608),
  candidate_hash text NOT NULL CHECK (candidate_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_qualitative_submission_course_tenant_fk
    FOREIGN KEY (course_id, institution_id) REFERENCES courses(id, institution_id) ON DELETE RESTRICT,
  CONSTRAINT petros_qualitative_submission_owner_command_uq UNIQUE (institution_id, student_id, command_id),
  CONSTRAINT petros_qualitative_submission_owner_revision_uq UNIQUE (institution_id, student_id, revision_id)
);
CREATE INDEX petros_qualitative_submissions_owner_created_idx
  ON petros_qualitative_submissions(institution_id, student_id, created_at);

CREATE TABLE petros_qualitative_reviews (
  id uuid PRIMARY KEY,
  command_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL UNIQUE REFERENCES petros_qualitative_submissions(id) ON DELETE RESTRICT,
  reviewer_institution_user_id uuid NOT NULL REFERENCES institution_users(id) ON DELETE RESTRICT,
  receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt) = 'object' AND pg_column_size(receipt) <= 262144),
  receipt_hash text NOT NULL CHECK (receipt_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_qualitative_review_course_tenant_fk
    FOREIGN KEY (course_id, institution_id) REFERENCES courses(id, institution_id) ON DELETE RESTRICT,
  CONSTRAINT petros_qualitative_review_institution_command_uq UNIQUE (institution_id, command_id)
);
CREATE INDEX petros_qualitative_reviews_reviewer_created_idx
  ON petros_qualitative_reviews(institution_id, reviewer_institution_user_id, created_at);

CREATE FUNCTION edrion_guard_petros_objective_evidence_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Petros evidence and qualitative review history is immutable';
END $$;
CREATE TRIGGER petros_objective_evidence_commands_immutable BEFORE UPDATE OR DELETE ON petros_objective_evidence_commands
  FOR EACH ROW EXECUTE FUNCTION edrion_guard_petros_objective_evidence_immutable();
CREATE TRIGGER petros_objective_evidence_events_immutable BEFORE UPDATE OR DELETE ON petros_objective_evidence_events
  FOR EACH ROW EXECUTE FUNCTION edrion_guard_petros_objective_evidence_immutable();
CREATE TRIGGER petros_qualitative_submissions_immutable BEFORE UPDATE OR DELETE ON petros_qualitative_submissions
  FOR EACH ROW EXECUTE FUNCTION edrion_guard_petros_objective_evidence_immutable();
CREATE TRIGGER petros_qualitative_reviews_immutable BEFORE UPDATE OR DELETE ON petros_qualitative_reviews
  FOR EACH ROW EXECUTE FUNCTION edrion_guard_petros_objective_evidence_immutable();

ALTER TABLE petros_objective_evidence_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_objective_evidence_commands FORCE ROW LEVEL SECURITY;
ALTER TABLE petros_objective_evidence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_objective_evidence_events FORCE ROW LEVEL SECURITY;
ALTER TABLE petros_objective_evidence_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_objective_evidence_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE petros_objective_evidence_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_objective_evidence_projections FORCE ROW LEVEL SECURITY;
ALTER TABLE petros_qualitative_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_qualitative_submissions FORCE ROW LEVEL SECURITY;
ALTER TABLE petros_qualitative_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_qualitative_reviews FORCE ROW LEVEL SECURITY;

CREATE POLICY petros_objective_evidence_commands_owner ON petros_objective_evidence_commands FOR ALL
  USING (institution_id::text = edrion_current_institution() AND (edrion_current_student() IS NULL OR student_id::text = edrion_current_student()))
  WITH CHECK (institution_id::text = edrion_current_institution() AND (edrion_current_student() IS NULL OR student_id::text = edrion_current_student()));
CREATE POLICY petros_objective_evidence_events_owner ON petros_objective_evidence_events FOR ALL
  USING (institution_id::text = edrion_current_institution() AND (edrion_current_student() IS NULL OR student_id::text = edrion_current_student()))
  WITH CHECK (institution_id::text = edrion_current_institution() AND (edrion_current_student() IS NULL OR student_id::text = edrion_current_student()));
CREATE POLICY petros_objective_evidence_outbox_owner ON petros_objective_evidence_outbox FOR ALL
  USING (institution_id::text = edrion_current_institution() AND (edrion_current_student() IS NULL OR student_id::text = edrion_current_student()))
  WITH CHECK (institution_id::text = edrion_current_institution() AND (edrion_current_student() IS NULL OR student_id::text = edrion_current_student()));
CREATE POLICY petros_objective_evidence_projections_owner ON petros_objective_evidence_projections FOR ALL
  USING (institution_id::text = edrion_current_institution() AND (edrion_current_student() IS NULL OR student_id::text = edrion_current_student()))
  WITH CHECK (institution_id::text = edrion_current_institution() AND (edrion_current_student() IS NULL OR student_id::text = edrion_current_student()));
CREATE POLICY petros_qualitative_submissions_owner ON petros_qualitative_submissions FOR ALL
  USING (institution_id::text = edrion_current_institution() AND (edrion_current_student() IS NULL OR student_id::text = edrion_current_student()))
  WITH CHECK (institution_id::text = edrion_current_institution() AND (edrion_current_student() IS NULL OR student_id::text = edrion_current_student()));
CREATE POLICY petros_qualitative_reviews_read ON petros_qualitative_reviews FOR SELECT
  USING (institution_id::text = edrion_current_institution() AND (edrion_current_student() IS NULL OR student_id::text = edrion_current_student()));
CREATE POLICY petros_qualitative_reviews_write ON petros_qualitative_reviews FOR INSERT
  WITH CHECK (institution_id::text = edrion_current_institution() AND edrion_current_student() IS NULL);

-- Explicit submission shares only its artifact and two exact revisions. It never opens an
-- institution-wide draft reader. Service authorization still requires current course/reviewer authority.
CREATE POLICY petros_artifact_explicit_submission_read ON petros_saved_artifacts FOR SELECT
  USING (institution_id::text=edrion_current_institution() AND edrion_current_student() IS NULL AND
    EXISTS(SELECT 1 FROM petros_qualitative_submissions s WHERE s.artifact_id=petros_saved_artifacts.id
      AND s.institution_id=petros_saved_artifacts.institution_id AND s.student_id=petros_saved_artifacts.student_id
      AND s.revision=petros_saved_artifacts.revision));
CREATE POLICY petros_artifact_revision_explicit_submission_read ON petros_artifact_revisions FOR SELECT
  USING (institution_id::text=edrion_current_institution() AND edrion_current_student() IS NULL AND
    EXISTS(SELECT 1 FROM petros_qualitative_submissions s WHERE s.artifact_id=petros_artifact_revisions.artifact_id
      AND s.institution_id=petros_artifact_revisions.institution_id AND s.student_id=petros_artifact_revisions.student_id
      AND petros_artifact_revisions.revision IN (s.revision,s.revision-1)));

GRANT SELECT, INSERT ON petros_objective_evidence_commands, petros_objective_evidence_events TO edrion_app;
GRANT SELECT, INSERT, UPDATE ON petros_objective_evidence_outbox, petros_objective_evidence_projections TO edrion_app;
GRANT SELECT, INSERT ON petros_qualitative_submissions, petros_qualitative_reviews TO edrion_app;
REVOKE UPDATE, DELETE ON petros_objective_evidence_commands, petros_objective_evidence_events,
  petros_qualitative_submissions, petros_qualitative_reviews FROM edrion_app;

-- PostgreSQL requires UPDATE visibility for SELECT FOR SHARE. This policy permits the
-- authority check to lock the explicitly shared current row, while WITH CHECK rejects every write.
CREATE POLICY petros_artifact_explicit_submission_lock ON petros_saved_artifacts FOR UPDATE
  USING (institution_id::text=edrion_current_institution() AND edrion_current_student() IS NULL AND
    EXISTS(SELECT 1 FROM petros_qualitative_submissions s WHERE s.artifact_id=petros_saved_artifacts.id
      AND s.institution_id=petros_saved_artifacts.institution_id AND s.student_id=petros_saved_artifacts.student_id
      AND s.revision=petros_saved_artifacts.revision))
  WITH CHECK (false);
