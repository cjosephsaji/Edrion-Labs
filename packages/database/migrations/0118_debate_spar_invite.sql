-- Debate P1 phase 5: spar invite hash index (reuse debates.invite_token_hash).

CREATE INDEX IF NOT EXISTS debates_invite_token_hash_idx
  ON debates (invite_token_hash)
  WHERE invite_token_hash IS NOT NULL;
