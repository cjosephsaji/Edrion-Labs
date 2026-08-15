-- Stage 7 stores curated diagrams in the existing Visual Studio canvas model.
-- Some long-lived databases predate the debate-origin column now present in the
-- Drizzle table contract; Postgres rejects all typed inserts when that column is
-- absent, even when a Petros canvas does not use it.
ALTER TABLE visual_canvases
  ADD COLUMN IF NOT EXISTS debate_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'visual_canvases_debate_id_fk'
  ) THEN
    ALTER TABLE visual_canvases
      ADD CONSTRAINT visual_canvases_debate_id_fk
      FOREIGN KEY (debate_id) REFERENCES debates(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS visual_canvases_debate_id_idx
  ON visual_canvases (debate_id)
  WHERE debate_id IS NOT NULL;
