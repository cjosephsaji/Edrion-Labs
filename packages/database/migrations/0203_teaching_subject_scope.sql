-- File teaching content under the subject it belongs to.
--
-- class_materials and class_stream_posts were scoped to a class and nothing else. A class has
-- many subjects, each with its own teacher (class_subject_teachers already records exactly that),
-- so every subject a class studies dumped its handouts into one undifferentiated pile and a
-- student could not tell which subject a file belonged to. class_notes already had subject_id;
-- these two now match it.
--
-- Nullable, because institution-wide or course-level posts legitimately have no subject, and
-- existing rows predate the column.

ALTER TABLE class_materials ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS class_materials_subject_idx ON class_materials(subject_id);
--> statement-breakpoint

ALTER TABLE class_stream_posts ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS class_stream_posts_subject_idx ON class_stream_posts(subject_id);
--> statement-breakpoint

-- The one pre-existing material was filed against a course whose code matches a subject code
-- (CSE102). Attach it to that subject so it stops looking like it arrived from nowhere.
UPDATE class_materials m
   SET subject_id = s.id
  FROM courses c
  JOIN subjects s
    ON s.institution_id = c.institution_id
   AND s.code = c.code
 WHERE m.context_type = 'course'
   AND m.context_id = c.id
   AND m.subject_id IS NULL;
