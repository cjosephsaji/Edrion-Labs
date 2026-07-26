CREATE TABLE IF NOT EXISTS prep_cohort_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  exam_profile_id uuid NOT NULL REFERENCES exam_profiles(id) ON DELETE CASCADE,
  as_of date NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prep_cohort_rollups_scope_uq UNIQUE (institution_id, exam_profile_id, as_of)
);
