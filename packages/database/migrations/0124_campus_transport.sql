-- Transport assignment read index for student mirror.

CREATE INDEX IF NOT EXISTS transport_assignments_student_active_idx
  ON transport_assignments (student_id)
  WHERE status = 'active';
