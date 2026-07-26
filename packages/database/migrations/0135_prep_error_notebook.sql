CREATE INDEX IF NOT EXISTS prep_error_notebook_owner_idx
  ON prep_error_notebook_entries (COALESCE(student_id::text, independent_user_id::text), updated_at DESC);
