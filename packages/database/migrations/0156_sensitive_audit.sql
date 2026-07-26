CREATE TABLE IF NOT EXISTS sensitive_report_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  seal_id uuid REFERENCES sensitive_report_seals(id) ON DELETE SET NULL,
  request_id uuid REFERENCES student_requests(id) ON DELETE SET NULL,
  actor_user_id uuid NOT NULL REFERENCES institution_users(id) ON DELETE CASCADE,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sensitive_report_audit_log_institution_idx
  ON sensitive_report_audit_log (institution_id, created_at DESC);
