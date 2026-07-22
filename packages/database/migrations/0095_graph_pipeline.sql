-- Graph Pipeline phase A1: freeze CanvasGraph v1 contract columns and indexes.

ALTER TABLE visual_canvases
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS node_count integer,
  ADD COLUMN IF NOT EXISTS source_meta jsonb;
--> statement-breakpoint

UPDATE visual_canvases
SET status = 'ready'
WHERE status IS NULL;
--> statement-breakpoint

UPDATE visual_canvases
SET node_count = COALESCE(jsonb_array_length(graph->'nodes'), 0)
WHERE node_count IS NULL;
--> statement-breakpoint

ALTER TABLE visual_canvases
  ALTER COLUMN status SET DEFAULT 'ready',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN node_count SET DEFAULT 0,
  ALTER COLUMN node_count SET NOT NULL;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE visual_canvases ADD CONSTRAINT visual_canvases_status_ck
    CHECK (status IN ('generating', 'ready', 'failed'));
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE visual_canvases ADD CONSTRAINT visual_canvases_node_count_ck
    CHECK (node_count >= 0);
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

ALTER TABLE visual_canvases DROP CONSTRAINT IF EXISTS visual_canvases_origin_ck;
--> statement-breakpoint

ALTER TABLE visual_canvases ADD CONSTRAINT visual_canvases_origin_ck
  CHECK (origin IN (
    'prompt',
    'library_source',
    'learn_topic',
    'learn_session',
    'memory',
    'legacy',
    'debate_clash'
  ));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS visual_canvases_student_active_updated_idx
  ON visual_canvases (student_id, updated_at DESC)
  WHERE deleted_at IS NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS visual_canvases_indep_active_updated_idx
  ON visual_canvases (independent_user_id, updated_at DESC)
  WHERE deleted_at IS NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS visual_canvases_schema_version_idx
  ON visual_canvases (schema_version)
  WHERE schema_version < 1;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS visual_canvases_status_idx
  ON visual_canvases (status);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS visual_canvas_revisions_canvas_revision_desc_idx
  ON visual_canvas_revisions (canvas_id, revision_number DESC);
