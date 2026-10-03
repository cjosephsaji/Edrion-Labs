-- Additive Phase 3 state. Original visual/projectile snapshots and wire readers remain intact.
ALTER TABLE petros_teaching_blocks ADD CONSTRAINT petros_block_session_owner_uq
 UNIQUE(id,session_id,institution_id,student_id);
CREATE TABLE petros_workspaces (
 id uuid PRIMARY KEY,
 institution_id uuid NOT NULL,
 student_id uuid NOT NULL,
 session_id uuid NOT NULL,
 block_id uuid NOT NULL,
 version integer NOT NULL CHECK(version BETWEEN 1 AND 999999),
 snapshot jsonb NOT NULL,
 policy jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT petros_workspace_scope FOREIGN KEY(block_id,session_id,institution_id,student_id)
  REFERENCES petros_teaching_blocks(id,session_id,institution_id,student_id),
 CONSTRAINT petros_workspace_identity CHECK(id=block_id),
 CONSTRAINT petros_workspace_owner_uq UNIQUE(id,institution_id,student_id),
 CONSTRAINT petros_workspace_snapshot CHECK((jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=512000
  AND snapshot->>'schemaVersion'='petros.engine-snapshot.v1' AND snapshot->'program'->>'programId'=id::text
  AND snapshot->'program'->>'ownerScopeRef'=institution_id::text || ':' || student_id::text
  AND snapshot->'execution'->>'version'=version::text) IS TRUE),
 CONSTRAINT petros_workspace_policy CHECK((jsonb_typeof(policy)='object' AND octet_length(policy::text)<=96000
  AND policy->>'schemaVersion'='petros.knowledge-policy.v1') IS TRUE)
);
CREATE UNIQUE INDEX petros_workspace_block ON petros_workspaces(block_id);
CREATE INDEX petros_workspace_owner ON petros_workspaces(institution_id,student_id,session_id);
--> statement-breakpoint
CREATE TABLE petros_workspace_checkpoints (
 id uuid PRIMARY KEY,
 workspace_id uuid NOT NULL,
 institution_id uuid NOT NULL,
 student_id uuid NOT NULL,
 version integer NOT NULL CHECK(version BETWEEN 1 AND 999999),
 branch_id text NOT NULL CHECK(length(branch_id) BETWEEN 1 AND 128),
 parent_checkpoint_id uuid,
 snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT petros_workspace_checkpoint_scope FOREIGN KEY(workspace_id,institution_id,student_id)
  REFERENCES petros_workspaces(id,institution_id,student_id),
 CONSTRAINT petros_workspace_checkpoint_owner_uq UNIQUE(id,workspace_id,institution_id,student_id),
 CONSTRAINT petros_workspace_checkpoint_parent FOREIGN KEY(parent_checkpoint_id,workspace_id,institution_id,student_id)
  REFERENCES petros_workspace_checkpoints(id,workspace_id,institution_id,student_id),
 CONSTRAINT petros_workspace_checkpoint_snapshot CHECK((jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=512000
  AND snapshot->>'schemaVersion'='petros.engine-snapshot.v1' AND snapshot->'program'->>'programId'=workspace_id::text
  AND snapshot->'execution'->>'branchId'=branch_id
  AND snapshot->'program'->>'ownerScopeRef'=institution_id::text || ':' || student_id::text
  AND snapshot->'execution'->>'version'=version::text) IS TRUE)
);
CREATE UNIQUE INDEX petros_workspace_checkpoint_version ON petros_workspace_checkpoints(workspace_id,version);
CREATE INDEX petros_workspace_checkpoint_owner ON petros_workspace_checkpoints(institution_id,student_id,workspace_id);
CREATE TABLE petros_workspace_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL,
 student_id uuid NOT NULL,
 session_id uuid NOT NULL,
 block_id uuid NOT NULL,
 operation_id uuid NOT NULL,
 command_hash text NOT NULL CHECK(command_hash ~ '^[a-f0-9]{64}$'),
 status text NOT NULL CHECK(status IN ('committed','cancelled')),
 command jsonb NOT NULL CHECK((jsonb_typeof(command)='object' AND octet_length(command::text)<=512000
  AND command->>'schemaVersion'='petros.engine-command.v1'
  AND command->>'programId'=block_id::text AND command->>'operationId'=operation_id::text) IS TRUE),
 checkpoint_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT petros_workspace_operation_scope FOREIGN KEY(block_id,session_id,institution_id,student_id)
  REFERENCES petros_teaching_blocks(id,session_id,institution_id,student_id),
 CONSTRAINT petros_workspace_operation_checkpoint FOREIGN KEY(checkpoint_id,block_id,institution_id,student_id)
  REFERENCES petros_workspace_checkpoints(id,workspace_id,institution_id,student_id),
 CONSTRAINT petros_workspace_operation_status CHECK((status='committed' AND checkpoint_id IS NOT NULL)
  OR (status='cancelled' AND checkpoint_id IS NULL))
);
CREATE UNIQUE INDEX petros_workspace_operation_key ON petros_workspace_operations(block_id,operation_id);
CREATE INDEX petros_workspace_operation_owner ON petros_workspace_operations(institution_id,student_id,block_id);
--> statement-breakpoint
CREATE FUNCTION petros_workspace_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Petros workspace history is immutable'; END $$;
CREATE TRIGGER petros_workspace_checkpoint_immutable BEFORE UPDATE OR DELETE ON petros_workspace_checkpoints
 FOR EACH ROW EXECUTE FUNCTION petros_workspace_history_immutable();
CREATE TRIGGER petros_workspace_operation_immutable BEFORE UPDATE OR DELETE ON petros_workspace_operations
 FOR EACH ROW EXECUTE FUNCTION petros_workspace_history_immutable();
CREATE FUNCTION petros_workspace_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW.institution_id,NEW.student_id,NEW.session_id,NEW.block_id) IS DISTINCT FROM
    (OLD.id,OLD.institution_id,OLD.student_id,OLD.session_id,OLD.block_id) OR NEW.version<>OLD.version+1 THEN
  RAISE EXCEPTION 'Petros workspace identity/version is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER petros_workspace_identity_immutable BEFORE UPDATE ON petros_workspaces
 FOR EACH ROW EXECUTE FUNCTION petros_workspace_identity_immutable();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['petros_workspaces','petros_workspace_checkpoints','petros_workspace_operations'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY petros_workspace_owner ON %I FOR ALL USING (institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student()) WITH CHECK (institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student())',t);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON petros_workspaces TO edrion_app;
REVOKE DELETE,TRUNCATE ON petros_workspaces FROM edrion_app;
GRANT SELECT,INSERT ON petros_workspace_checkpoints,petros_workspace_operations TO edrion_app;
REVOKE UPDATE,DELETE,TRUNCATE ON petros_workspace_checkpoints,petros_workspace_operations FROM edrion_app;
--> statement-breakpoint
-- A challenge hides its criterion until the learner has appended one response. Both records
-- pin an acknowledged checkpoint; exploration and predictions never enter the mastery ledger.
CREATE TABLE petros_workspace_prediction_challenges (
 id uuid PRIMARY KEY,
 workspace_id uuid NOT NULL,
 institution_id uuid NOT NULL,
 student_id uuid NOT NULL,
 request_id uuid NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 checkpoint_id uuid NOT NULL,
 program_hash text NOT NULL CHECK(program_hash ~ '^[a-f0-9]{64}$'),
 program_revision integer NOT NULL CHECK(program_revision BETWEEN 1 AND 999999),
 experiment_version integer NOT NULL CHECK(experiment_version BETWEEN 1 AND 999999),
 model_id text NOT NULL CHECK(length(model_id) BETWEEN 1 AND 80),
 capability_id text NOT NULL CHECK(length(capability_id) BETWEEN 1 AND 80),
 solver text NOT NULL CHECK(length(solver) BETWEEN 1 AND 100),
 prompt text NOT NULL CHECK(length(prompt) BETWEEN 1 AND 500),
 target_time double precision NOT NULL CHECK(target_time >= 0 AND target_time <= 200),
 output_port text NOT NULL CHECK(length(output_port) BETWEEN 1 AND 80),
 unit text NOT NULL CHECK(length(unit) BETWEEN 1 AND 32),
 reference_value double precision NOT NULL,
 tolerance double precision NOT NULL CHECK(tolerance > 0),
 prior_exploration boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT petros_workspace_prediction_checkpoint FOREIGN KEY(checkpoint_id,workspace_id,institution_id,student_id)
  REFERENCES petros_workspace_checkpoints(id,workspace_id,institution_id,student_id),
 CONSTRAINT petros_workspace_prediction_scope UNIQUE(id,workspace_id,institution_id,student_id)
);
CREATE UNIQUE INDEX petros_workspace_prediction_request ON petros_workspace_prediction_challenges(workspace_id,request_id);
CREATE INDEX petros_workspace_prediction_owner ON petros_workspace_prediction_challenges(institution_id,student_id,workspace_id);
CREATE TABLE petros_workspace_prediction_responses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 challenge_id uuid NOT NULL UNIQUE,
 workspace_id uuid NOT NULL,
 institution_id uuid NOT NULL,
 student_id uuid NOT NULL,
 request_id uuid NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 predicted_value double precision NOT NULL,
 assistance text NOT NULL CHECK(assistance IN ('none_observed','petros_help','external_declared','unknown')),
 result text NOT NULL CHECK(result IN ('within_tolerance','outside_tolerance')),
 reference_value double precision NOT NULL,
 criterion_tolerance double precision NOT NULL CHECK(criterion_tolerance > 0),
 mastery_admitted boolean NOT NULL DEFAULT false CHECK(mastery_admitted = false),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT petros_workspace_prediction_response_scope FOREIGN KEY(challenge_id,workspace_id,institution_id,student_id)
  REFERENCES petros_workspace_prediction_challenges(id,workspace_id,institution_id,student_id)
);
CREATE UNIQUE INDEX petros_workspace_prediction_response_request ON petros_workspace_prediction_responses(workspace_id,request_id);
CREATE INDEX petros_workspace_prediction_response_owner ON petros_workspace_prediction_responses(institution_id,student_id,workspace_id);
CREATE TRIGGER petros_workspace_prediction_challenge_immutable BEFORE UPDATE OR DELETE ON petros_workspace_prediction_challenges
 FOR EACH ROW EXECUTE FUNCTION petros_workspace_history_immutable();
CREATE TRIGGER petros_workspace_prediction_response_immutable BEFORE UPDATE OR DELETE ON petros_workspace_prediction_responses
 FOR EACH ROW EXECUTE FUNCTION petros_workspace_history_immutable();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['petros_workspace_prediction_challenges','petros_workspace_prediction_responses'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY petros_workspace_owner ON %I FOR ALL USING (institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student()) WITH CHECK (institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student())',t);
 END LOOP;
END $$;
GRANT SELECT,INSERT ON petros_workspace_prediction_challenges,petros_workspace_prediction_responses TO edrion_app;
REVOKE UPDATE,DELETE,TRUNCATE ON petros_workspace_prediction_challenges,petros_workspace_prediction_responses FROM edrion_app;
