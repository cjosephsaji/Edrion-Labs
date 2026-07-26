CREATE INDEX IF NOT EXISTS parent_health_profiles_student_revision_idx
  ON parent_health_profiles (student_id, revision DESC);
