-- Plan 02: revision freshness, evidence tags, append-only AI cost log.

CREATE TABLE IF NOT EXISTS "revision_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid,
	"independent_user_id" uuid,
	"topic_id" uuid NOT NULL,
	"freshness" text DEFAULT 'fresh' NOT NULL,
	"last_evidence_at" timestamp with time zone NOT NULL,
	"last_refreshed_at" timestamp with time zone,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revision_states_subject_ck" CHECK (
		("student_id" IS NOT NULL AND "independent_user_id" IS NULL)
		OR ("student_id" IS NULL AND "independent_user_id" IS NOT NULL)
	)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "revision_states" ADD CONSTRAINT "revision_states_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "revision_states" ADD CONSTRAINT "revision_states_independent_user_id_fk" FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "revision_states" ADD CONSTRAINT "revision_states_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learn_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "revision_states_student_topic_uq" ON "revision_states" ("student_id","topic_id") WHERE "student_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "revision_states_indep_topic_uq" ON "revision_states" ("independent_user_id","topic_id") WHERE "independent_user_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid,
	"independent_user_id" uuid,
	"tag_key" text NOT NULL,
	"label" text NOT NULL,
	"polarity" text NOT NULL,
	"note" text NOT NULL,
	"evidence_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_tags_subject_ck" CHECK (
		("student_id" IS NOT NULL AND "independent_user_id" IS NULL)
		OR ("student_id" IS NULL AND "independent_user_id" IS NOT NULL)
	)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_tags" ADD CONSTRAINT "evidence_tags_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_tags" ADD CONSTRAINT "evidence_tags_independent_user_id_fk" FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "evidence_tags_student_key_uq" ON "evidence_tags" ("student_id","tag_key") WHERE "student_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "evidence_tags_indep_key_uq" ON "evidence_tags" ("independent_user_id","tag_key") WHERE "independent_user_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learn_ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"student_id" uuid,
	"independent_user_id" uuid,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cached" boolean DEFAULT false NOT NULL,
	"duration_ms" integer,
	"error" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learn_ai_calls" ADD CONSTRAINT "learn_ai_calls_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learn_ai_calls" ADD CONSTRAINT "learn_ai_calls_independent_user_id_fk" FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION learn_ai_calls_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'learn_ai_calls is append-only'; END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS learn_ai_calls_no_update ON learn_ai_calls;
--> statement-breakpoint
CREATE TRIGGER learn_ai_calls_no_update BEFORE UPDATE OR DELETE ON learn_ai_calls
  FOR EACH ROW EXECUTE FUNCTION learn_ai_calls_immutable();
