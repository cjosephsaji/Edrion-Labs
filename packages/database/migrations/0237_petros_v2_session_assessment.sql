-- M4 additive engineering migration. No environment installation or qualifications are seeded.
ALTER TABLE petros_learning_sessions ADD COLUMN engine_version text NOT NULL DEFAULT 'v1' CHECK(engine_version IN ('v1','v2'));
ALTER TABLE petros_learning_sessions ADD COLUMN v2_state jsonb;
ALTER TABLE petros_learning_sessions ADD CONSTRAINT m4_state_shape CHECK ((engine_version='v1' AND v2_state IS NULL) OR
 (engine_version='v2' AND v2_state IS NOT NULL AND octet_length(v2_state::text)<=98304
 AND v2_state->>'stage' IN ('admitting','planning','delivering','awaiting_response','evaluating')));
CREATE FUNCTION m4_session_engine_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.engine_version<>OLD.engine_version THEN RAISE EXCEPTION 'M4_ENGINE_IMMUTABLE'; END IF; RETURN NEW; END $$;
CREATE TRIGGER m4_engine_immutable BEFORE UPDATE ON petros_learning_sessions FOR EACH ROW EXECUTE FUNCTION m4_session_engine_immutable();
ALTER TABLE petros_learning_sessions ADD CONSTRAINT m4_session_owner_uq UNIQUE(id,institution_id,student_id);
CREATE TABLE petros_v2_tasks (
 id uuid PRIMARY KEY,institution_id uuid NOT NULL,student_id uuid NOT NULL,session_id uuid NOT NULL,
 candidate_id uuid NOT NULL REFERENCES petros_teaching_pack_candidates(id),review_id uuid NOT NULL REFERENCES petros_teaching_pack_reviews(id),
 contract_hash text NOT NULL CHECK(contract_hash ~ '^[a-f0-9]{64}$'),instance_hash text NOT NULL CHECK(instance_hash ~ '^[a-f0-9]{64}$'),
 equivalence_key text NOT NULL CHECK(length(equivalence_key) BETWEEN 1 AND 180),public_task jsonb NOT NULL CHECK(octet_length(public_task::text)<=48000),
 issued_at timestamptz NOT NULL DEFAULT now(),UNIQUE(session_id),UNIQUE(id,session_id,institution_id,student_id),
 FOREIGN KEY(session_id,institution_id,student_id) REFERENCES petros_learning_sessions(id,institution_id,student_id));
CREATE TABLE petros_v2_responses (
 id uuid PRIMARY KEY,institution_id uuid NOT NULL,student_id uuid NOT NULL,session_id uuid NOT NULL,task_id uuid NOT NULL UNIQUE,
 command_id uuid NOT NULL,response jsonb NOT NULL CHECK(octet_length(response::text)<=65536),response_hash text NOT NULL CHECK(response_hash ~ '^[a-f0-9]{64}$'),
 task_instance_hash text NOT NULL CHECK(task_instance_hash ~ '^[a-f0-9]{64}$'),session_revision integer NOT NULL CHECK(session_revision>=0),
 epoch integer NOT NULL CHECK(epoch>=0),canvas_revision integer NOT NULL CHECK(canvas_revision>=0),checkpoint_id uuid,snapshot_hash text,
 exposure jsonb NOT NULL CHECK(octet_length(exposure::text)<=16384),committed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(session_id,command_id),UNIQUE(id,session_id,institution_id,student_id),
 FOREIGN KEY(task_id,session_id,institution_id,student_id) REFERENCES petros_v2_tasks(id,session_id,institution_id,student_id));
CREATE TABLE petros_v2_evaluations (
 id uuid PRIMARY KEY,institution_id uuid NOT NULL,student_id uuid NOT NULL,session_id uuid NOT NULL,response_id uuid NOT NULL,
 publication_hash text NOT NULL,contract_hash text NOT NULL,result jsonb NOT NULL CHECK(octet_length(result::text)<=65536),
 supersedes uuid UNIQUE REFERENCES petros_v2_evaluations(id),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(response_id,session_id,institution_id,student_id) REFERENCES petros_v2_responses(id,session_id,institution_id,student_id));
CREATE UNIQUE INDEX m4_initial_evaluation_uq ON petros_v2_evaluations(response_id) WHERE supersedes IS NULL;
ALTER TABLE petros_objective_evidence_commands ALTER COLUMN evaluation_id DROP NOT NULL;
ALTER TABLE petros_objective_evidence_commands ADD COLUMN v2_evaluation_id uuid REFERENCES petros_v2_evaluations(id);
ALTER TABLE petros_objective_evidence_commands ADD CONSTRAINT m4_evidence_command_union CHECK(num_nonnulls(evaluation_id,v2_evaluation_id)=1);
ALTER TABLE petros_objective_evidence_events ALTER COLUMN evaluation_id DROP NOT NULL;
ALTER TABLE petros_objective_evidence_events ADD COLUMN v2_evaluation_id uuid REFERENCES petros_v2_evaluations(id);
ALTER TABLE petros_objective_evidence_events ADD COLUMN engine_version text NOT NULL DEFAULT 'v1';
ALTER TABLE petros_objective_evidence_events ADD CONSTRAINT m4_evidence_event_union CHECK(
 (engine_version='v1' AND evaluation_id IS NOT NULL AND v2_evaluation_id IS NULL) OR
 (engine_version='v2' AND evaluation_id IS NULL AND v2_evaluation_id IS NOT NULL AND evidence->>'schemaVersion'='petros.v2.criterion-evidence.v1'));
CREATE UNIQUE INDEX m4_evidence_evaluation_uq ON petros_objective_evidence_events(v2_evaluation_id) WHERE corrects_event_id IS NULL;
-- Extend the workspace owner's typed union. V1 constraints retain their exact original branch.
ALTER TABLE petros_workspaces DROP CONSTRAINT petros_workspace_snapshot;
ALTER TABLE petros_workspaces ADD CONSTRAINT petros_workspace_snapshot CHECK(octet_length(snapshot::text)<=512000 AND (
 (snapshot->>'schemaVersion'='petros.engine-snapshot.v1' AND snapshot->'program'->>'programId'=id::text
 AND snapshot->'program'->>'ownerScopeRef'=institution_id::text||':'||student_id::text AND snapshot->'execution'->>'version'=version::text)
 OR (snapshot->>'schemaVersion'='petros.v2.workspace.v1' AND snapshot->>'workspaceId'=id::text AND snapshot->>'version'=version::text
 AND octet_length(snapshot::text)<=98304)) IS TRUE);
ALTER TABLE petros_workspaces DROP CONSTRAINT petros_workspace_policy;
ALTER TABLE petros_workspaces ADD CONSTRAINT petros_workspace_policy CHECK(octet_length(policy::text)<=96000 AND
 policy->>'schemaVersion' IN ('petros.knowledge-policy.v1','petros.v2.workspace-policy.v1'));
ALTER TABLE petros_workspace_checkpoints DROP CONSTRAINT petros_workspace_checkpoint_snapshot;
ALTER TABLE petros_workspace_checkpoints ADD CONSTRAINT petros_workspace_checkpoint_snapshot CHECK(octet_length(snapshot::text)<=512000 AND (
 (snapshot->>'schemaVersion'='petros.engine-snapshot.v1' AND snapshot->'program'->>'programId'=workspace_id::text
 AND snapshot->'execution'->>'branchId'=branch_id AND snapshot->'program'->>'ownerScopeRef'=institution_id::text||':'||student_id::text
 AND snapshot->'execution'->>'version'=version::text) OR (snapshot->>'schemaVersion'='petros.v2.workspace.v1'
 AND snapshot->>'workspaceId'=workspace_id::text AND snapshot->>'version'=version::text AND snapshot->'canvas'->>'branchId'=branch_id
 AND octet_length(snapshot::text)<=98304)) IS TRUE);
-- Existing anonymous command check is located by its definition, preserving all other checks.
DO $$ DECLARE n text; BEGIN SELECT conname INTO n FROM pg_constraint WHERE conrelid='petros_workspace_operations'::regclass AND contype='c'
 AND pg_get_constraintdef(oid) LIKE '%petros.engine-command.v1%'; IF n IS NOT NULL THEN EXECUTE format('ALTER TABLE petros_workspace_operations DROP CONSTRAINT %I',n); END IF; END $$;
ALTER TABLE petros_workspace_operations ADD CONSTRAINT m4_workspace_operation_union CHECK(octet_length(command::text)<=98304 AND
 command->>'schemaVersion' IN ('petros.engine-command.v1','petros.v2.workspace-command.v1') AND command->>'programId'=block_id::text
 AND command->>'operationId'=operation_id::text);
ALTER TABLE petros_objective_evidence_outbox DROP CONSTRAINT petros_objective_evidence_outbox_topic_check;
ALTER TABLE petros_objective_evidence_outbox ADD CONSTRAINT petros_objective_evidence_outbox_topic_check
 CHECK(topic IN ('petros.objective-evidence.appended.v1','petros.v2.criterion-evidence.appended.v1'));
