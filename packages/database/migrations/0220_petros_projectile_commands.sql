-- Additive, default-off trusted analytic capability. Original S7 data is untouched.
ALTER TABLE petros_teaching_blocks ADD COLUMN projectile_snapshot jsonb;
ALTER TABLE petros_teaching_blocks ADD CONSTRAINT petros_projectile_snapshot_valid CHECK (
 projectile_snapshot IS NULL OR (
  type = 'diagram' AND jsonb_typeof(projectile_snapshot) = 'object'
  AND octet_length(projectile_snapshot::text) <= 96000
  AND projectile_snapshot->>'schemaVersion' = 'petros.projectile-snapshot.v1'
  AND projectile_snapshot->'binding'->>'originalDiagramBlockId' = id::text
 ) IS TRUE
);
ALTER TABLE petros_teaching_blocks ADD CONSTRAINT petros_block_owner_identity UNIQUE(id,institution_id,student_id);
--> statement-breakpoint
CREATE TABLE petros_visual_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES institutions(id),
 student_id uuid NOT NULL REFERENCES students(id),
 block_id uuid NOT NULL,
 operation_id uuid NOT NULL,
 command_hash text NOT NULL CHECK(command_hash ~ '^[a-f0-9]{64}$'),
 status text NOT NULL CHECK(status IN ('committed','cancelled')),
 snapshot jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT petros_visual_operations_scope FOREIGN KEY(block_id,institution_id,student_id)
  REFERENCES petros_teaching_blocks(id,institution_id,student_id),
 CONSTRAINT petros_visual_operations_snapshot CHECK (
  (status='cancelled' AND snapshot IS NULL) OR
  (status='committed' AND snapshot IS NOT NULL AND (
   octet_length(snapshot::text)<=96000 AND snapshot->>'schemaVersion'='petros.projectile-snapshot.v1'
   AND snapshot->>'commandHash'=command_hash AND snapshot->>'operationId'=operation_id::text
   AND snapshot->'binding'->>'originalDiagramBlockId'=block_id::text) IS TRUE)
 )
);
CREATE UNIQUE INDEX petros_visual_operations_key ON petros_visual_operations(block_id,operation_id);
CREATE INDEX petros_visual_operations_owner ON petros_visual_operations(institution_id,student_id,block_id);
ALTER TABLE petros_visual_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_visual_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY petros_visual_operations_owner ON petros_visual_operations FOR ALL
 USING (institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student())
 WITH CHECK (institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student());
--> statement-breakpoint
CREATE FUNCTION petros_visual_operations_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Petros visual command receipts are immutable'; END $$;
CREATE TRIGGER petros_visual_operations_immutable BEFORE UPDATE OR DELETE ON petros_visual_operations
 FOR EACH ROW EXECUTE FUNCTION petros_visual_operations_immutable();
GRANT SELECT,INSERT ON petros_visual_operations TO edrion_app;
REVOKE UPDATE,DELETE ON petros_visual_operations FROM edrion_app;
