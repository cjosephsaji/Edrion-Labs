-- Debate P1 phase 3: feedback report share token index.

CREATE UNIQUE INDEX IF NOT EXISTS debate_feedback_reports_share_token_uq
  ON debate_feedback_reports (share_token)
  WHERE share_token IS NOT NULL;
