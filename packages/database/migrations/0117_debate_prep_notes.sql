-- Debate P1 phase 4: prep notes version guard (application-enforced; index for lookup).

CREATE INDEX IF NOT EXISTS debate_prep_notes_debate_idx ON debate_prep_notes (debate_id);
