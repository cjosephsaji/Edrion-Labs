-- Identity verification replay cache (DB fallback; Redis primary in service).

CREATE INDEX IF NOT EXISTS identity_scan_audit_student_idx
  ON identity_scan_audit (student_id, occurred_at DESC);
