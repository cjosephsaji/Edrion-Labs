-- Debate P1 phase 2: capture / STT state checks.

DO $$ BEGIN
  ALTER TABLE debate_turns ADD CONSTRAINT debate_turns_capture_state_ck CHECK (
    capture_state IS NULL OR capture_state IN ('pending', 'recording', 'uploading', 'stored', 'failed')
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE debate_turns ADD CONSTRAINT debate_turns_stt_state_ck CHECK (
    stt_state IS NULL OR stt_state IN ('not_started', 'queued', 'running', 'done', 'failed', 'skipped_ai')
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
