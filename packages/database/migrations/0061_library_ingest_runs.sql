-- Library ingest: persisted stages, heartbeats, and queue status.

ALTER TABLE "knowledge_items"
	ADD COLUMN IF NOT EXISTS "ingest_stage" text,
	ADD COLUMN IF NOT EXISTS "ingest_heartbeat_at" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "ingest_attempts" integer DEFAULT 0 NOT NULL,
	ADD COLUMN IF NOT EXISTS "ingest_error_detail" text;
--> statement-breakpoint
UPDATE "knowledge_items"
SET
	"status" = 'queued',
	"ingest_attempts" = 0
WHERE "status" IN ('uploading', 'reading');
