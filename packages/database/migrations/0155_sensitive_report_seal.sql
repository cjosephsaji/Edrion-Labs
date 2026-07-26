-- Sensitive report sealed identity (security-reviewed schema).

CREATE TABLE IF NOT EXISTS sensitive_report_seals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  request_id uuid NOT NULL UNIQUE REFERENCES student_requests(id) ON DELETE CASCADE,
  sealed_payload bytea NOT NULL,
  key_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE student_requests
  ALTER COLUMN student_id DROP NOT NULL;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE student_requests ADD CONSTRAINT student_requests_student_id_ck CHECK (
    student_id IS NOT NULL OR type = 'sensitive_report'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
