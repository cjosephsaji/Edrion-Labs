-- Outpass gate pass lookup.

CREATE INDEX IF NOT EXISTS gate_passes_holder_student_active_idx
  ON gate_passes (holder_student_id, status)
  WHERE holder_student_id IS NOT NULL AND status = 'active';
