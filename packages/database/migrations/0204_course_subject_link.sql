-- Link a course to the subject it teaches.
--
-- A college carries both `subjects` (the curriculum entry a class studies, via
-- class_subject_teachers) and `courses` (the unit students enrol in). Nothing connected them but a
-- matching `code` string, so teaching content filed against a course could not be found from the
-- subject side: a file attached to course CSE102 was invisible in the workspace for the subject of
-- the same name, while still reaching students through their course enrolment.

ALTER TABLE courses ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS courses_subject_idx ON courses(subject_id);
--> statement-breakpoint

-- Backfill on the only correspondence that exists today: same institution, same code.
UPDATE courses c
   SET subject_id = s.id
  FROM subjects s
 WHERE s.institution_id = c.institution_id
   AND s.code = c.code
   AND c.subject_id IS NULL;
