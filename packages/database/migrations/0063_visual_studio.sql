-- Visual Studio (Thinking Canvas): canvases, revisions, revision queue manual fields.

CREATE TABLE IF NOT EXISTS "visual_canvases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid,
	"student_id" uuid,
	"independent_user_id" uuid,
	"title" text NOT NULL,
	"archetype" text NOT NULL,
	"graph" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"origin" text NOT NULL,
	"source_id" uuid,
	"topic_id" uuid,
	"source_session_id" uuid,
	"legacy_artifact_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visual_canvases_subject_ck" CHECK (
		("student_id" IS NOT NULL AND "independent_user_id" IS NULL AND "institution_id" IS NOT NULL)
		OR ("student_id" IS NULL AND "independent_user_id" IS NOT NULL AND "institution_id" IS NULL)
	),
	CONSTRAINT "visual_canvases_archetype_ck" CHECK (
		"archetype" IN ('mind_map','flowchart','cycle','timeline','hierarchy','comparison')
	),
	CONSTRAINT "visual_canvases_origin_ck" CHECK (
		"origin" IN ('prompt','library_source','learn_topic','learn_session','memory','legacy')
	)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visual_canvases" ADD CONSTRAINT "visual_canvases_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visual_canvases" ADD CONSTRAINT "visual_canvases_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visual_canvases" ADD CONSTRAINT "visual_canvases_independent_user_id_fk" FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visual_canvases" ADD CONSTRAINT "visual_canvases_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visual_canvases" ADD CONSTRAINT "visual_canvases_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learn_topics"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visual_canvases" ADD CONSTRAINT "visual_canvases_source_session_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."learn_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visual_canvases" ADD CONSTRAINT "visual_canvases_legacy_artifact_id_fk" FOREIGN KEY ("legacy_artifact_id") REFERENCES "public"."knowledge_artifacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visual_canvases_student_updated_idx" ON "visual_canvases" ("student_id","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visual_canvases_indep_updated_idx" ON "visual_canvases" ("independent_user_id","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visual_canvases_source_idx" ON "visual_canvases" ("source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visual_canvases_topic_idx" ON "visual_canvases" ("topic_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "visual_canvases_legacy_artifact_uq" ON "visual_canvases" ("legacy_artifact_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "visual_canvas_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canvas_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"graph" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"archetype" text NOT NULL,
	"reason" text NOT NULL,
	"created_by" text DEFAULT 'student' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visual_canvas_revisions_canvas_revision_uq" UNIQUE ("canvas_id","revision_number")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visual_canvas_revisions" ADD CONSTRAINT "visual_canvas_revisions_canvas_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."visual_canvases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visual_canvas_revisions_canvas_created_idx" ON "visual_canvas_revisions" ("canvas_id","created_at");
--> statement-breakpoint

ALTER TABLE "revision_states" ADD COLUMN IF NOT EXISTS "manual_due_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "revision_states" ADD COLUMN IF NOT EXISTS "manual_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL;
