-- Plan 03: school homework + college assignment extensions (staff FK, not teachers).

CREATE TABLE IF NOT EXISTS "homework" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"class_id" uuid NOT NULL,
	"subject_id" uuid,
	"teacher_id" uuid,
	"title" text NOT NULL,
	"instructions" text,
	"due_at" timestamp with time zone NOT NULL,
	"ai_policy" text DEFAULT 'off' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"assigned_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework" ADD CONSTRAINT "homework_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework" ADD CONSTRAINT "homework_campus_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework" ADD CONSTRAINT "homework_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework" ADD CONSTRAINT "homework_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework" ADD CONSTRAINT "homework_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_class_idx" ON "homework" ("class_id","due_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "homework_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"homework_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"prompt_text" text,
	"prompt_image_object_id" uuid,
	"max_marks" integer,
	CONSTRAINT "homework_questions_prompt_ck" CHECK (
		"prompt_text" IS NOT NULL OR "prompt_image_object_id" IS NOT NULL
	),
	CONSTRAINT "homework_questions_homework_sequence_uq" UNIQUE ("homework_id","sequence")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_questions" ADD CONSTRAINT "homework_questions_homework_id_fk" FOREIGN KEY ("homework_id") REFERENCES "public"."homework"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_questions" ADD CONSTRAINT "homework_questions_prompt_image_object_id_fk" FOREIGN KEY ("prompt_image_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "homework_assignees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"homework_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	CONSTRAINT "homework_assignees_homework_student_uq" UNIQUE ("homework_id","student_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_assignees" ADD CONSTRAINT "homework_assignees_homework_id_fk" FOREIGN KEY ("homework_id") REFERENCES "public"."homework"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_assignees" ADD CONSTRAINT "homework_assignees_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "homework_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"homework_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" text DEFAULT 'assigned' NOT NULL,
	"submitted_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"total_marks" integer,
	"total_max" integer,
	"teacher_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "homework_submissions_homework_student_uq" UNIQUE ("homework_id","student_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_homework_id_fk" FOREIGN KEY ("homework_id") REFERENCES "public"."homework"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "homework_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"mode" text DEFAULT 'type' NOT NULL,
	"answer_text" text,
	"answer_object_id" uuid,
	"teacher_marks" integer,
	"teacher_feedback" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homework_answers_submission_question_uq" UNIQUE ("submission_id","question_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_answers" ADD CONSTRAINT "homework_answers_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."homework_submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_answers" ADD CONSTRAINT "homework_answers_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."homework_questions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_answers" ADD CONSTRAINT "homework_answers_answer_object_id_fk" FOREIGN KEY ("answer_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "attachment_object_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "late_policy" jsonb;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "allow_resubmission" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "ai_policy" text DEFAULT 'off' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assignment_submission_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"file_object_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"late" boolean DEFAULT false NOT NULL,
	CONSTRAINT "assignment_submission_versions_submission_version_uq" UNIQUE ("submission_id","version_no")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_submission_versions" ADD CONSTRAINT "assignment_submission_versions_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."assignment_submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
