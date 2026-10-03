ALTER TABLE petros_planning_decisions ADD COLUMN adaptive_snapshot jsonb;
ALTER TABLE petros_teaching_blocks ADD COLUMN projectile_binding jsonb;
ALTER TABLE petros_question_specs ADD COLUMN learning_task jsonb;
ALTER TABLE petros_learning_sessions ADD CONSTRAINT petros_session_owner_identity UNIQUE(id,institution_id,student_id);
ALTER TABLE petros_planning_decisions ADD CONSTRAINT petros_adaptive_snapshot_valid CHECK (
 adaptive_snapshot IS NULL OR (jsonb_typeof(adaptive_snapshot)='object'
 AND adaptive_snapshot->>'schemaVersion'='petros.adaptive-snapshot.v1'
 AND octet_length(adaptive_snapshot::text)<=64000) IS TRUE
);
ALTER TABLE petros_teaching_blocks ADD CONSTRAINT petros_projectile_binding_valid CHECK (
 projectile_binding IS NULL OR (type='diagram' AND jsonb_typeof(projectile_binding)='object'
 AND projectile_binding->>'schemaVersion'='petros.projectile-binding.v1'
 AND projectile_binding->>'originalDiagramBlockId'=id::text
 AND octet_length(projectile_binding::text)<=16000) IS TRUE
);
ALTER TABLE petros_question_specs ADD CONSTRAINT petros_learning_task_valid CHECK (
 learning_task IS NULL OR (jsonb_typeof(learning_task)='object'
 AND learning_task->>'schemaVersion'='petros.learning-task-binding.v1'
 AND octet_length(learning_task::text)<=16000) IS TRUE
);
--> statement-breakpoint
CREATE TABLE petros_adaptive_bindings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES institutions(id),
 student_id uuid NOT NULL REFERENCES students(id),
 session_id uuid NOT NULL,
 command_id uuid NOT NULL,
 command_hash text NOT NULL CHECK(command_hash ~ '^[a-f0-9]{64}$'),
 binding jsonb NOT NULL CHECK((jsonb_typeof(binding)='object' AND octet_length(binding::text)<=32000) IS TRUE),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT petros_adaptive_binding_scope FOREIGN KEY(session_id,institution_id,student_id)
 REFERENCES petros_learning_sessions(id,institution_id,student_id)
);
CREATE UNIQUE INDEX petros_adaptive_bindings_session ON petros_adaptive_bindings(session_id);
ALTER TABLE petros_adaptive_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_adaptive_bindings FORCE ROW LEVEL SECURITY;
CREATE POLICY petros_adaptive_bindings_owner ON petros_adaptive_bindings FOR ALL
 USING (institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student())
 WITH CHECK (institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student());
--> statement-breakpoint
CREATE FUNCTION petros_adaptive_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='petros_adaptive_bindings' THEN
  RAISE EXCEPTION 'Adaptive bindings are immutable';
 ELSIF TG_TABLE_NAME='petros_planning_decisions' THEN
  IF NEW.adaptive_snapshot IS DISTINCT FROM OLD.adaptive_snapshot THEN
   RAISE EXCEPTION 'Adaptive policy snapshots are immutable';
  END IF;
 ELSIF TG_TABLE_NAME='petros_teaching_blocks' THEN
  IF NEW.projectile_binding IS DISTINCT FROM OLD.projectile_binding THEN
   RAISE EXCEPTION 'Projectile source bindings are immutable';
  END IF;
 ELSIF TG_TABLE_NAME='petros_question_specs' THEN
  IF NEW.learning_task IS DISTINCT FROM OLD.learning_task THEN
   RAISE EXCEPTION 'Learning task bindings are immutable';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER petros_adaptive_binding_immutable BEFORE UPDATE OR DELETE ON petros_adaptive_bindings FOR EACH ROW EXECUTE FUNCTION petros_adaptive_immutable();
CREATE TRIGGER petros_adaptive_decision_immutable BEFORE UPDATE ON petros_planning_decisions FOR EACH ROW EXECUTE FUNCTION petros_adaptive_immutable();
CREATE TRIGGER petros_adaptive_diagram_immutable BEFORE UPDATE ON petros_teaching_blocks FOR EACH ROW EXECUTE FUNCTION petros_adaptive_immutable();
CREATE TRIGGER petros_adaptive_task_immutable BEFORE UPDATE ON petros_question_specs FOR EACH ROW EXECUTE FUNCTION petros_adaptive_immutable();
GRANT SELECT,INSERT ON petros_adaptive_bindings TO edrion_app;
REVOKE UPDATE,DELETE,TRUNCATE ON petros_adaptive_bindings FROM edrion_app;
