-- Petros Phase 6: topicality guardrails — decline aggregates + per-scope topicality mode.
ALTER TABLE "ai_policies" ADD COLUMN IF NOT EXISTS "topicality_mode" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "petros_decline_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"category" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "petros_decline_stats" ADD CONSTRAINT "petros_decline_stats_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "petros_decline_stats_uniq" ON "petros_decline_stats" ("institution_id","category","day");
