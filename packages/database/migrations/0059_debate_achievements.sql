-- Plan 04: debate lab + append-only achievement awards.

CREATE TABLE IF NOT EXISTS "debates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid,
	"student_id" uuid,
	"independent_user_id" uuid,
	"motion" text NOT NULL,
	"side" text NOT NULL,
	"format" text NOT NULL,
	"mode" text NOT NULL,
	"invite_token_hash" text,
	"stage" text DEFAULT 'setup' NOT NULL,
	"turn_seconds" integer DEFAULT 180 NOT NULL,
	"feedback" jsonb,
	"audio_seam" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "debates_subject_ck" CHECK (
		("student_id" IS NOT NULL AND "independent_user_id" IS NULL)
		OR ("student_id" IS NULL AND "independent_user_id" IS NOT NULL)
	)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "debates" ADD CONSTRAINT "debates_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "debates" ADD CONSTRAINT "debates_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "debates" ADD CONSTRAINT "debates_independent_user_id_fk" FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "debate_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"debate_id" uuid NOT NULL,
	"role" text NOT NULL,
	"student_id" uuid,
	"independent_user_id" uuid,
	"display_name" text NOT NULL,
	"side" text,
	"joined_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "debate_participants" ADD CONSTRAINT "debate_participants_debate_id_fk" FOREIGN KEY ("debate_id") REFERENCES "public"."debates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "debate_participants" ADD CONSTRAINT "debate_participants_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "debate_participants" ADD CONSTRAINT "debate_participants_independent_user_id_fk" FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "debate_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"debate_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"round" text NOT NULL,
	"speaker_role" text NOT NULL,
	"text" text NOT NULL,
	"audio_object_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debate_turns_debate_sequence_uq" UNIQUE ("debate_id","sequence")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "debate_turns" ADD CONSTRAINT "debate_turns_debate_id_fk" FOREIGN KEY ("debate_id") REFERENCES "public"."debates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "debate_turns" ADD CONSTRAINT "debate_turns_audio_object_id_fk" FOREIGN KEY ("audio_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "achievement_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid,
	"independent_user_id" uuid,
	"badge_key" text NOT NULL,
	"tier" text DEFAULT 'bronze' NOT NULL,
	"evidence_note" text NOT NULL,
	"evidence_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievement_awards_subject_ck" CHECK (
		("student_id" IS NOT NULL AND "independent_user_id" IS NULL)
		OR ("student_id" IS NULL AND "independent_user_id" IS NOT NULL)
	)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "achievement_awards" ADD CONSTRAINT "achievement_awards_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "achievement_awards" ADD CONSTRAINT "achievement_awards_independent_user_id_fk" FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "achievement_awards_student_badge_tier_uq" ON "achievement_awards" ("student_id","badge_key","tier") WHERE "student_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "achievement_awards_indep_badge_tier_uq" ON "achievement_awards" ("independent_user_id","badge_key","tier") WHERE "independent_user_id" IS NOT NULL;
