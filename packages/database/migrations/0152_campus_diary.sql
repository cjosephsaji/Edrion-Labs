CREATE TABLE IF NOT EXISTS student_diary_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  page_date date NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_diary_pages_student_date_uq UNIQUE (student_id, page_date)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS student_diary_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  page_id uuid NOT NULL REFERENCES student_diary_pages(id) ON DELETE CASCADE,
  assignment_id uuid,
  kind text NOT NULL DEFAULT 'note',
  body text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
