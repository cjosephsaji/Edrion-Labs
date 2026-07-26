-- Digital ID token rotation index.

CREATE INDEX IF NOT EXISTS student_id_cards_inst_student_idx
  ON student_id_cards (institution_id, student_id);
