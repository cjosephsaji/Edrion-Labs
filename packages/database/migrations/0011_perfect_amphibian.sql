CREATE TABLE IF NOT EXISTS "background_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"queue" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"items_processed" integer DEFAULT 0 NOT NULL,
	"detail" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "background_jobs_name_started_idx" ON "background_jobs" USING btree ("name","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "background_jobs_started_idx" ON "background_jobs" USING btree ("started_at");