-- Campus access scan context.

CREATE INDEX IF NOT EXISTS campus_access_logs_pass_idx
  ON campus_access_logs (pass_id, occurred_at DESC)
  WHERE pass_id IS NOT NULL;
