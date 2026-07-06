-- Plan 01: student preferences, content pages, feature definition seeds.

CREATE TABLE IF NOT EXISTS "student_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid,
	"independent_user_id" uuid,
	"theme" text DEFAULT 'standard' NOT NULL,
	"match_system" boolean DEFAULT false NOT NULL,
	"text_size" text DEFAULT 'M' NOT NULL,
	"reduced_motion" boolean DEFAULT false NOT NULL,
	"hint_generosity" text DEFAULT 'balanced' NOT NULL,
	"celebration" text DEFAULT 'warm' NOT NULL,
	"weekly_goal" integer DEFAULT 8 NOT NULL,
	"quiet_hours" jsonb,
	"notif_session_reminders" boolean DEFAULT true NOT NULL,
	"notif_revision_due" boolean DEFAULT true NOT NULL,
	"notif_announcements" boolean DEFAULT true NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"expert_mode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "student_preferences_subject_ck" CHECK (
		("student_id" IS NOT NULL AND "independent_user_id" IS NULL)
		OR ("student_id" IS NULL AND "independent_user_id" IS NOT NULL)
	)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_preferences" ADD CONSTRAINT "student_preferences_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_preferences" ADD CONSTRAINT "student_preferences_independent_user_id_fk" FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_preferences_student_uq" ON "student_preferences" ("student_id") WHERE "student_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_preferences_indep_uq" ON "student_preferences" ("independent_user_id") WHERE "independent_user_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_content_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"page_key" text NOT NULL,
	"title" text NOT NULL,
	"body_richtext" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attachment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audience" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "student_content_pages_inst_page_key_uq" UNIQUE ("institution_id","page_key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_content_pages" ADD CONSTRAINT "student_content_pages_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_content_pages" ADD CONSTRAINT "student_content_pages_campus_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_content_pages_inst_idx" ON "student_content_pages" ("institution_id");
--> statement-breakpoint
INSERT INTO "feature_definitions" ("id", "key", "name", "description", "module", "status", "default_value", "available_scopes", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'student.portal', 'Student portal', 'Master kill-switch for the student portal', 'student-portal', 'active', 'true', '["institution","campus","institutionUser"]'::jsonb, now(), now()),
  (gen_random_uuid(), 'student.surface.fees', 'Fees surface', 'Show fee summary to students', 'student-portal', 'active', 'false', '["institution","campus","institutionUser"]'::jsonb, now(), now()),
  (gen_random_uuid(), 'student.surface.transport', 'Transport surface', 'Show transport info to students', 'student-portal', 'active', 'false', '["institution","campus","institutionUser"]'::jsonb, now(), now()),
  (gen_random_uuid(), 'student.surface.hostel', 'Hostel surface', 'Show hostel info to students', 'student-portal', 'active', 'false', '["institution","campus","institutionUser"]'::jsonb, now(), now()),
  (gen_random_uuid(), 'student.surface.documents', 'Documents surface', 'Show institution documents to students', 'student-portal', 'active', 'false', '["institution","campus","institutionUser"]'::jsonb, now(), now()),
  (gen_random_uuid(), 'student.surface.content', 'Content pages surface', 'Show custom content pages to students', 'student-portal', 'active', 'false', '["institution","campus","institutionUser"]'::jsonb, now(), now()),
  (gen_random_uuid(), 'student.surface.exams', 'Exams surface', 'Show institution exams to students', 'student-portal', 'active', 'false', '["institution","campus","institutionUser"]'::jsonb, now(), now()),
  (gen_random_uuid(), 'student.expert_mode', 'Expert mode', 'Allow independent learners to enable exam prep mode', 'student-portal', 'active', 'true', '["institutionUser"]'::jsonb, now(), now()),
  (gen_random_uuid(), 'student.learn.engine', 'Learn engine', 'Petros learn features', 'student-portal', 'active', 'true', '["institution","campus","institutionUser"]'::jsonb, now(), now()),
  (gen_random_uuid(), 'student.lab.debate_friend', 'Debate friend mode', 'Allow friend debate mode in the lab', 'student-portal', 'active', 'true', '["institutionUser"]'::jsonb, now(), now())
ON CONFLICT ("key") DO NOTHING;
