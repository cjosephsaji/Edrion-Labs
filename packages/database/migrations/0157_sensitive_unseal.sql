-- Unseal approvals must exist before indexes (table was previously created too late in 0181).
CREATE TABLE IF NOT EXISTS sensitive_report_unseal_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  seal_id uuid NOT NULL REFERENCES sensitive_report_seals(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  approver_user_id uuid NOT NULL REFERENCES institution_users(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sensitive_report_unseal_approvals_seal_idx
  ON sensitive_report_unseal_approvals (seal_id, expires_at DESC);
