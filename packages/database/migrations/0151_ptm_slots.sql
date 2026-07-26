CREATE INDEX IF NOT EXISTS parent_ptm_slots_institution_starts_idx
  ON parent_ptm_slots (institution_id, starts_at);
