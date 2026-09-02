-- Guidance controls, availability and explicit learning decisions belong to the student.
-- Reuse the owner-scoped companion preferences row and its existing RLS policy.
ALTER TABLE petros_student_companion_preferences
  ADD COLUMN IF NOT EXISTS mentor_state jsonb NOT NULL DEFAULT '{}'::jsonb;
