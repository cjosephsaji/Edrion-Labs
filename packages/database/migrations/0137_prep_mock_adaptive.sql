ALTER TABLE mock_exam_attempts
  ADD COLUMN IF NOT EXISTS delivery_profile_key text,
  ADD COLUMN IF NOT EXISTS route_path jsonb;
