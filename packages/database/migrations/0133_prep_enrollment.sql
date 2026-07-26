-- Prep enrollment uniqueness per owner/profile.

CREATE UNIQUE INDEX IF NOT EXISTS prep_enrollments_owner_profile_uq
  ON prep_enrollments (exam_profile_id, COALESCE(student_id::text, independent_user_id::text));
