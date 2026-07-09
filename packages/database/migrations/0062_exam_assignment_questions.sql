-- Phase 6 extension: exam/assignment questions, student targeting, online attempts.

-- Parent column additions -------------------------------------------------------

ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "audience" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "duration_min" integer;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "audience" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "duration_min" integer;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "delivery_mode" text NOT NULL DEFAULT 'file';
--> statement-breakpoint
-- Backfill existing assignments: class target from class_id.
UPDATE "assignments"
SET "audience" = jsonb_build_array(jsonb_build_object('kind', 'class', 'refId', "class_id"::text))
WHERE "audience" = '[]'::jsonb OR "audience" IS NULL;
--> statement-breakpoint

-- Exam paper questions ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS "exam_paper_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_schedule_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"qtype" text NOT NULL,
	"prompt" text NOT NULL,
	"prompt_image_object_id" uuid,
	"options" jsonb,
	"correct_key" text,
	"marking_note" text,
	"marks" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_paper_questions_schedule_sequence_uq" UNIQUE ("exam_schedule_id","sequence")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_paper_questions" ADD CONSTRAINT "exam_paper_questions_schedule_id_fk" FOREIGN KEY ("exam_schedule_id") REFERENCES "public"."exam_schedules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_paper_questions" ADD CONSTRAINT "exam_paper_questions_prompt_image_fk" FOREIGN KEY ("prompt_image_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_paper_questions_schedule_idx" ON "exam_paper_questions" ("exam_schedule_id");
--> statement-breakpoint

-- Assignment questions ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS "assignment_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"qtype" text NOT NULL,
	"prompt" text NOT NULL,
	"prompt_image_object_id" uuid,
	"options" jsonb,
	"correct_key" text,
	"marking_note" text,
	"marks" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_questions_assignment_sequence_uq" UNIQUE ("assignment_id","sequence")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_questions" ADD CONSTRAINT "assignment_questions_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_questions" ADD CONSTRAINT "assignment_questions_prompt_image_fk" FOREIGN KEY ("prompt_image_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_questions_assignment_idx" ON "assignment_questions" ("assignment_id");
--> statement-breakpoint

-- Student targeting (materialized roster) ---------------------------------------

CREATE TABLE IF NOT EXISTS "exam_assignees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	CONSTRAINT "exam_assignees_exam_student_uq" UNIQUE ("exam_id","student_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_assignees" ADD CONSTRAINT "exam_assignees_exam_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_assignees" ADD CONSTRAINT "exam_assignees_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assignment_assignees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	CONSTRAINT "assignment_assignees_assignment_student_uq" UNIQUE ("assignment_id","student_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_assignees" ADD CONSTRAINT "assignment_assignees_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_assignees" ADD CONSTRAINT "assignment_assignees_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

-- Exam attempts -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "exam_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_schedule_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"attempt_no" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"auto_score" integer,
	"max_score" integer,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"results" jsonb,
	CONSTRAINT "exam_attempts_schedule_student_attempt_uq" UNIQUE ("exam_schedule_id","student_id","attempt_no")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_schedule_id_fk" FOREIGN KEY ("exam_schedule_id") REFERENCES "public"."exam_schedules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_attempts_schedule_idx" ON "exam_attempts" ("exam_schedule_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_attempts_student_idx" ON "exam_attempts" ("student_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "exam_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"choice_key" text,
	"answer_text" text,
	"answer_object_id" uuid,
	"auto_correct" boolean,
	"awarded_marks" integer,
	"teacher_marks" integer,
	"teacher_feedback" text,
	"ai_note" text,
	"needs_review" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_answers_attempt_question_uq" UNIQUE ("attempt_id","question_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."exam_attempts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."exam_paper_questions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_answer_object_id_fk" FOREIGN KEY ("answer_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

-- Assignment attempts -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS "assignment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"attempt_no" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"auto_score" integer,
	"max_score" integer,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"results" jsonb,
	CONSTRAINT "assignment_attempts_assignment_student_attempt_uq" UNIQUE ("assignment_id","student_id","attempt_no")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_attempts" ADD CONSTRAINT "assignment_attempts_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_attempts" ADD CONSTRAINT "assignment_attempts_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_attempts_assignment_idx" ON "assignment_attempts" ("assignment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_attempts_student_idx" ON "assignment_attempts" ("student_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "assignment_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"choice_key" text,
	"answer_text" text,
	"answer_object_id" uuid,
	"auto_correct" boolean,
	"awarded_marks" integer,
	"teacher_marks" integer,
	"teacher_feedback" text,
	"ai_note" text,
	"needs_review" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_answers_attempt_question_uq" UNIQUE ("attempt_id","question_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_answers" ADD CONSTRAINT "assignment_answers_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."assignment_attempts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_answers" ADD CONSTRAINT "assignment_answers_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."assignment_questions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_answers" ADD CONSTRAINT "assignment_answers_answer_object_id_fk" FOREIGN KEY ("answer_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
