-- One preprocessing result per student-owned document version. Raw document text stays
-- in knowledge_item_pages; sessions consume only the selected topic's page range.
CREATE TABLE IF NOT EXISTS petros_document_lesson_outlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  knowledge_item_id uuid NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  document_version integer NOT NULL,
  source_fingerprint text NOT NULL,
  outline jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS petros_document_lesson_outlines_version_uq
  ON petros_document_lesson_outlines (
    institution_id,
    student_id,
    knowledge_item_id,
    document_version,
    source_fingerprint
  );

CREATE INDEX IF NOT EXISTS petros_document_lesson_outlines_owner_item_idx
  ON petros_document_lesson_outlines (institution_id, student_id, knowledge_item_id);

ALTER TABLE petros_document_lesson_outlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_document_lesson_outlines FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS petros_document_lesson_outlines_owner_private ON petros_document_lesson_outlines;
CREATE POLICY petros_document_lesson_outlines_owner_private ON petros_document_lesson_outlines
  FOR ALL
  USING (
    (edrion_current_student() IS NULL AND edrion_current_institution() IS NULL)
    OR (
      student_id::text = edrion_current_student()
      AND institution_id::text = edrion_current_institution()
    )
  )
  WITH CHECK (
    (edrion_current_student() IS NULL AND edrion_current_institution() IS NULL)
    OR (
      student_id::text = edrion_current_student()
      AND institution_id::text = edrion_current_institution()
    )
  );
