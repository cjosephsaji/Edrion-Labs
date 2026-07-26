-- Debate P1 phase 3: adjudication run primary partial unique.

CREATE UNIQUE INDEX IF NOT EXISTS debate_adjudication_runs_primary_uq
  ON debate_adjudication_runs (debate_id)
  WHERE is_primary = true;
