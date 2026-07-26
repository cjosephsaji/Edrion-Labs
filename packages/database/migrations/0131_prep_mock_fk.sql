-- Prep: FK mock exams to exam_profiles.

ALTER TABLE mock_exams
  ADD COLUMN IF NOT EXISTS exam_profile_id uuid REFERENCES exam_profiles(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS mock_exams_exam_profile_id_idx
  ON mock_exams (exam_profile_id)
  WHERE exam_profile_id IS NOT NULL;
