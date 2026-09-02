-- Teacher-written lesson notes as a first-class record.
--
-- class_materials already exists, but its object_id is NOT NULL: a "note" there is
-- really a file with a label on it, and cannot be written in the product at all.
-- class_notes stores the writing itself — body is required, attachments are optional —
-- with a draft/published lifecycle so a teacher can write before students can read.

CREATE TABLE IF NOT EXISTS class_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES campuses(id) ON DELETE CASCADE,
  -- 'class' | 'course' | 'subject', matching the class_materials/class_stream_posts convention.
  context_type text NOT NULL,
  context_id uuid NOT NULL,
  subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text,
  body text NOT NULL,
  topic_key text,
  week_no integer,
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  -- storage_objects ids. Optional, unlike class_materials.object_id.
  attachment_object_ids jsonb NOT NULL DEFAULT '[]',
  author_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_notes_status_ck CHECK(status IN ('draft','published','archived')),
  CONSTRAINT class_notes_context_ck CHECK(context_type IN ('class','course','subject')),
  -- A published note must record when it went live; a draft must not claim to be live.
  CONSTRAINT class_notes_published_ck CHECK(
    (status = 'published' AND published_at IS NOT NULL) OR
    (status <> 'published' AND published_at IS NULL)
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS class_notes_ctx_idx ON class_notes(context_type, context_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS class_notes_subject_idx ON class_notes(subject_id, status);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS class_note_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES class_notes(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL,
  summary text,
  body text NOT NULL,
  edited_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS class_note_revisions_uq ON class_note_revisions(note_id, version);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS class_note_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES class_notes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS class_note_reads_uq ON class_note_reads(note_id, student_id);
