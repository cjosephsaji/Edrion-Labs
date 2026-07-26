-- Debate P1 phase 2: transcript read index.

CREATE INDEX IF NOT EXISTS debate_transcripts_debate_created_idx
  ON debate_transcripts (debate_id, created_at DESC);
