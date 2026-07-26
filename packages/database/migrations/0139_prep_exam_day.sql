CREATE TABLE IF NOT EXISTS prep_exam_day_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  enrollment_id uuid NOT NULL REFERENCES prep_enrollments(id) ON DELETE CASCADE,
  exam_date date NOT NULL,
  checklist jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
