-- Additive to the existing teaching-block owner, with tenant/student RLS for this field and content.
-- Retain the original content and interaction_state for older readers and artifact conversion.
ALTER TABLE petros_teaching_blocks ADD COLUMN visual_snapshot jsonb;
--> statement-breakpoint
ALTER TABLE petros_teaching_blocks ADD CONSTRAINT petros_visual_snapshot_bound CHECK (
  visual_snapshot IS NULL OR (
    type = 'diagram' AND jsonb_typeof(visual_snapshot) = 'object'
    AND octet_length(visual_snapshot::text) <= 96000
    AND visual_snapshot->'program'->>'schemaVersion' = 'petros.visual-program.v1'
    AND visual_snapshot->'program'->>'programId' = id::text
    AND visual_snapshot->>'validatorVersion' = 'petros.visual-validator.v1'
  ) IS TRUE
);
--> statement-breakpoint
-- This legacy table had API owner filters but no enabled RLS policy. Preserve the standard
-- platform-wide/staff scope while confining student transactions to their own blocks.
ALTER TABLE petros_teaching_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_teaching_blocks FORCE ROW LEVEL SECURITY;
CREATE POLICY petros_teaching_blocks_owner ON petros_teaching_blocks FOR ALL
  USING ((edrion_current_institution() IS NULL OR institution_id::text = edrion_current_institution())
    AND (edrion_current_student() IS NULL OR student_id::text = edrion_current_student()))
  WITH CHECK ((edrion_current_institution() IS NULL OR institution_id::text = edrion_current_institution())
    AND (edrion_current_student() IS NULL OR student_id::text = edrion_current_student()));
