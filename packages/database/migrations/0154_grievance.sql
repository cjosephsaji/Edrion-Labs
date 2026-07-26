CREATE INDEX IF NOT EXISTS student_requests_grievance_inbox_idx
  ON student_requests (institution_id, status, created_at DESC)
  WHERE type IN ('grievance', 'helpdesk_ticket', 'sensitive_report');
