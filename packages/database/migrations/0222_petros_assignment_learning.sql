-- Phase 2 bounded Petros assignment learning releases.
-- No release is seeded. The feature remains default-off and the current authority path is
-- deliberately limited to one active, enrolled recipient with an approved pack/session.

CREATE TABLE petros_assignment_learning_releases (
  id uuid PRIMARY KEY,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
  assignment_version integer NOT NULL CHECK (assignment_version BETWEEN 0 AND 100000),
  authority_hash text NOT NULL CHECK (authority_hash ~ '^[a-f0-9]{64}$'),
  audience_hash text NOT NULL CHECK (audience_hash ~ '^[a-f0-9]{64}$'),
  candidate jsonb NOT NULL CHECK (
    jsonb_typeof(candidate) = 'object' AND
    candidate->>'schemaVersion' = 'petros.assignment-learning-release.v1' AND
    pg_column_size(candidate) <= 524288
  ),
  state text NOT NULL DEFAULT 'released' CHECK (state = 'released'),
  created_by_user_id uuid NOT NULL REFERENCES institution_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_assignment_learning_release_assignment_uq UNIQUE (assignment_id)
);
CREATE INDEX petros_assignment_learning_release_tenant_created_idx
  ON petros_assignment_learning_releases(institution_id, created_at);

CREATE TABLE petros_assignment_learning_targets (
  id uuid PRIMARY KEY,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  release_id uuid NOT NULL REFERENCES petros_assignment_learning_releases(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('document', 'objective', 'journey')),
  target jsonb NOT NULL CHECK (jsonb_typeof(target) = 'object' AND pg_column_size(target) <= 131072),
  source_snapshot jsonb NOT NULL CHECK (jsonb_typeof(source_snapshot) = 'object' AND pg_column_size(source_snapshot) <= 131072),
  objective_snapshot jsonb NOT NULL CHECK (jsonb_typeof(objective_snapshot) = 'object' AND pg_column_size(objective_snapshot) <= 16384),
  pack_snapshot jsonb NOT NULL CHECK (jsonb_typeof(pack_snapshot) = 'object' AND pg_column_size(pack_snapshot) <= 393216),
  curriculum_snapshot jsonb NOT NULL CHECK (jsonb_typeof(curriculum_snapshot) = 'object' AND pg_column_size(curriculum_snapshot) <= 16384),
  rubric_snapshot jsonb NOT NULL CHECK (jsonb_typeof(rubric_snapshot) = 'object' AND pg_column_size(rubric_snapshot) <= 65536),
  assistance_snapshot jsonb NOT NULL CHECK (jsonb_typeof(assistance_snapshot) = 'object' AND pg_column_size(assistance_snapshot) <= 8192),
  resource_snapshot jsonb NOT NULL CHECK (jsonb_typeof(resource_snapshot) = 'object' AND pg_column_size(resource_snapshot) <= 131072),
  evidence_snapshot jsonb NOT NULL CHECK (jsonb_typeof(evidence_snapshot) = 'object' AND pg_column_size(evidence_snapshot) <= 8192),
  rollout_gates jsonb NOT NULL CHECK (jsonb_typeof(rollout_gates) = 'object' AND pg_column_size(rollout_gates) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_assignment_learning_target_release_uq UNIQUE (release_id)
);
CREATE INDEX petros_assignment_learning_target_tenant_idx
  ON petros_assignment_learning_targets(institution_id, release_id);

CREATE TABLE petros_assignment_learning_recipients (
  id uuid PRIMARY KEY,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  release_id uuid NOT NULL REFERENCES petros_assignment_learning_releases(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL REFERENCES petros_learning_sessions(id) ON DELETE RESTRICT,
  binding jsonb NOT NULL CHECK (jsonb_typeof(binding) = 'object' AND pg_column_size(binding) <= 65536),
  eligibility_snapshot jsonb NOT NULL CHECK (jsonb_typeof(eligibility_snapshot) = 'object' AND pg_column_size(eligibility_snapshot) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_assignment_learning_recipient_uq UNIQUE (release_id, student_id)
);
CREATE INDEX petros_assignment_learning_recipient_student_idx
  ON petros_assignment_learning_recipients(institution_id, student_id);

CREATE TABLE petros_assignment_learning_receipts (
  command_id uuid PRIMARY KEY,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  release_id uuid NOT NULL REFERENCES petros_assignment_learning_releases(id) ON DELETE RESTRICT,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object' AND pg_column_size(response) <= 32768),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_assignment_learning_receipt_tenant_command_uq UNIQUE (institution_id, command_id)
);

CREATE TABLE petros_assignment_learning_outbox (
  id uuid PRIMARY KEY,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  release_id uuid NOT NULL UNIQUE REFERENCES petros_assignment_learning_releases(id) ON DELETE RESTRICT,
  topic text NOT NULL CHECK (topic = 'petros.assignment-learning.released.v1'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 8192),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 100),
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX petros_assignment_learning_outbox_pending_idx
  ON petros_assignment_learning_outbox(status, available_at);

CREATE FUNCTION edrion_guard_petros_assignment_learning_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Petros assignment learning release history is immutable';
END $$;
CREATE TRIGGER petros_assignment_learning_releases_immutable
  BEFORE UPDATE OR DELETE ON petros_assignment_learning_releases
  FOR EACH ROW EXECUTE FUNCTION edrion_guard_petros_assignment_learning_immutable();
CREATE TRIGGER petros_assignment_learning_targets_immutable
  BEFORE UPDATE OR DELETE ON petros_assignment_learning_targets
  FOR EACH ROW EXECUTE FUNCTION edrion_guard_petros_assignment_learning_immutable();
CREATE TRIGGER petros_assignment_learning_recipients_immutable
  BEFORE UPDATE OR DELETE ON petros_assignment_learning_recipients
  FOR EACH ROW EXECUTE FUNCTION edrion_guard_petros_assignment_learning_immutable();
CREATE TRIGGER petros_assignment_learning_receipts_immutable
  BEFORE UPDATE OR DELETE ON petros_assignment_learning_receipts
  FOR EACH ROW EXECUTE FUNCTION edrion_guard_petros_assignment_learning_immutable();

ALTER TABLE petros_assignment_learning_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_assignment_learning_releases FORCE ROW LEVEL SECURITY;
ALTER TABLE petros_assignment_learning_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_assignment_learning_targets FORCE ROW LEVEL SECURITY;
ALTER TABLE petros_assignment_learning_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_assignment_learning_recipients FORCE ROW LEVEL SECURITY;
ALTER TABLE petros_assignment_learning_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_assignment_learning_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE petros_assignment_learning_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_assignment_learning_outbox FORCE ROW LEVEL SECURITY;

CREATE POLICY petros_assignment_learning_releases_tenant ON petros_assignment_learning_releases FOR ALL
  USING (institution_id::text = edrion_current_institution() AND nullif(current_setting('app.student_id', true), '') IS NULL)
  WITH CHECK (institution_id::text = edrion_current_institution() AND nullif(current_setting('app.student_id', true), '') IS NULL);
CREATE POLICY petros_assignment_learning_targets_tenant ON petros_assignment_learning_targets FOR ALL
  USING (institution_id::text = edrion_current_institution() AND nullif(current_setting('app.student_id', true), '') IS NULL)
  WITH CHECK (institution_id::text = edrion_current_institution() AND nullif(current_setting('app.student_id', true), '') IS NULL);
CREATE POLICY petros_assignment_learning_recipients_read ON petros_assignment_learning_recipients FOR SELECT
  USING (institution_id::text = edrion_current_institution() AND
    (nullif(current_setting('app.student_id', true), '') IS NULL OR student_id::text = current_setting('app.student_id', true)));
CREATE POLICY petros_assignment_learning_recipients_write ON petros_assignment_learning_recipients FOR INSERT
  WITH CHECK (institution_id::text = edrion_current_institution() AND nullif(current_setting('app.student_id', true), '') IS NULL);
CREATE POLICY petros_assignment_learning_receipts_tenant ON petros_assignment_learning_receipts FOR ALL
  USING (institution_id::text = edrion_current_institution() AND nullif(current_setting('app.student_id', true), '') IS NULL)
  WITH CHECK (institution_id::text = edrion_current_institution() AND nullif(current_setting('app.student_id', true), '') IS NULL);
CREATE POLICY petros_assignment_learning_outbox_tenant ON petros_assignment_learning_outbox FOR ALL
  USING (institution_id::text = edrion_current_institution() AND nullif(current_setting('app.student_id', true), '') IS NULL)
  WITH CHECK (institution_id::text = edrion_current_institution() AND nullif(current_setting('app.student_id', true), '') IS NULL);

-- Delivery may update delivery state, never the event identity or publication payload.
CREATE FUNCTION edrion_guard_petros_assignment_outbox_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR
    (to_jsonb(NEW) - ARRAY['status','attempts','available_at','processed_at']) IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['status','attempts','available_at','processed_at']) THEN
    RAISE EXCEPTION 'Petros assignment outbox identity is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER petros_assignment_outbox_identity BEFORE UPDATE OR DELETE
  ON petros_assignment_learning_outbox FOR EACH ROW EXECUTE FUNCTION edrion_guard_petros_assignment_outbox_identity();
