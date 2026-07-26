ALTER TABLE sensitive_report_unseal_approvals
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS sensitive_report_unseal_pair_uq
  ON sensitive_report_unseal_approvals (seal_id, approver_user_id);
