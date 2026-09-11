ALTER TABLE petros_document_lesson_outlines
  ADD COLUMN IF NOT EXISTS lesson_plan jsonb;
