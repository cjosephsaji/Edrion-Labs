-- Additive sidecars preserve the existing strict objective projections and historical rows.
ALTER TABLE petros_answer_evaluations ADD COLUMN assessment jsonb;
ALTER TABLE petros_learner_evidence_events ADD COLUMN assessment jsonb;
--> statement-breakpoint
ALTER TABLE petros_answer_evaluations ADD CONSTRAINT petros_answer_assessment_bound CHECK (
  assessment IS NULL OR (jsonb_typeof(assessment) = 'object' AND octet_length(assessment::text) <= 96000
    AND assessment->>'schemaVersion' = 'petros.assessment.v1'
    AND assessment->'result'->>'kind' = 'objective') IS TRUE
);
ALTER TABLE petros_learner_evidence_events ADD CONSTRAINT petros_evidence_assessment_bound CHECK (
  assessment IS NULL OR (jsonb_typeof(assessment) = 'object' AND octet_length(assessment::text) <= 96000
    AND assessment->>'schemaVersion' = 'petros.assessment.v1'
    AND assessment->'result'->>'kind' = 'objective') IS TRUE
);
--> statement-breakpoint
-- These canonical legacy owners lacked enabled RLS. Preserve platform/staff conventions.
ALTER TABLE petros_answer_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_answer_evaluations FORCE ROW LEVEL SECURITY;
CREATE POLICY petros_answer_assessment_owner ON petros_answer_evaluations FOR ALL
  USING ((edrion_current_institution() IS NULL OR institution_id::text = edrion_current_institution())
    AND (edrion_current_student() IS NULL OR student_id::text = edrion_current_student()))
  WITH CHECK ((edrion_current_institution() IS NULL OR institution_id::text = edrion_current_institution())
    AND (edrion_current_student() IS NULL OR student_id::text = edrion_current_student()));
ALTER TABLE petros_learner_evidence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_learner_evidence_events FORCE ROW LEVEL SECURITY;
CREATE POLICY petros_evidence_assessment_owner ON petros_learner_evidence_events FOR ALL
  USING ((edrion_current_institution() IS NULL OR institution_id::text = edrion_current_institution())
    AND (edrion_current_student() IS NULL OR student_id::text = edrion_current_student()))
  WITH CHECK ((edrion_current_institution() IS NULL OR institution_id::text = edrion_current_institution())
    AND (edrion_current_student() IS NULL OR student_id::text = edrion_current_student()));
