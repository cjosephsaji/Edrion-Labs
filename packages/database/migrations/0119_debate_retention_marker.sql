-- Debate P1 phase 6: retention sweep marker column.

ALTER TABLE debates
  ADD COLUMN IF NOT EXISTS audio_expired_at timestamptz;
