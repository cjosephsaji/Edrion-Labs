-- Tier 3 completion: sensitive report ownership (unseal approvals created in 0157).

CREATE TABLE IF NOT EXISTS student_sensitive_report_ownership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  request_id uuid NOT NULL UNIQUE REFERENCES student_requests(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS student_sensitive_report_ownership_student_idx
  ON student_sensitive_report_ownership (student_id);
