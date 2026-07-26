-- Plan 03: student planner + exam goals.
-- calendar_events already exists (0037_parent_portal); tenant RLS already in zzz_rls.sql.

CREATE TABLE IF NOT EXISTS "student_planner_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid,
	"independent_user_id" uuid,
	"title" text NOT NULL,
	"on_date" date NOT NULL,
	"time_label" text,
	"kind" text DEFAULT 'task' NOT NULL,
	"topic_key" text,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "student_planner_items_subject_ck" CHECK (
		("student_id" IS NOT NULL AND "independent_user_id" IS NULL)
		OR ("student_id" IS NULL AND "independent_user_id" IS NOT NULL)
	)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_planner_items" ADD CONSTRAINT "student_planner_items_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_planner_items" ADD CONSTRAINT "student_planner_items_independent_user_id_fk" FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_planner_items_student_date_idx" ON "student_planner_items" ("student_id","on_date") WHERE "student_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_planner_items_indep_date_idx" ON "student_planner_items" ("independent_user_id","on_date") WHERE "independent_user_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_exam_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"independent_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"exam_date" date NOT NULL,
	"syllabus_topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_exam_goals" ADD CONSTRAINT "student_exam_goals_independent_user_id_fk" FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_exam_goals_indep_idx" ON "student_exam_goals" ("independent_user_id","exam_date");
