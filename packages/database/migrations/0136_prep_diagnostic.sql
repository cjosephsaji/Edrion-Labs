CREATE INDEX IF NOT EXISTS prep_diagnostic_runs_enrollment_idx
  ON prep_diagnostic_runs (enrollment_id, created_at DESC);
