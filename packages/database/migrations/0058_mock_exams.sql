-- Plan 04: mock exams (builder, attempts, answers).

CREATE TABLE IF NOT EXISTS "mock_exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid,
	"student_id" uuid,
	"independent_user_id" uuid,
	"title" text NOT NULL,
	"subject_label" text NOT NULL,
	"topics" jsonb NOT NULL,
	"context" jsonb NOT NULL,
	"reference_object_id" uuid,
	"exam_goal_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "mock_exams_subject_ck" CHECK (
		("student_id" IS NOT NULL AND "independent_user_id" IS NULL)
		OR ("student_id" IS NULL AND "independent_user_id" IS NOT NULL)
	)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mock_exams" ADD CONSTRAINT "mock_exams_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mock_exams" ADD CONSTRAINT "mock_exams_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mock_exams" ADD CONSTRAINT "mock_exams_independent_user_id_fk" FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mock_exams" ADD CONSTRAINT "mock_exams_reference_object_id_fk" FOREIGN KEY ("reference_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mock_exams" ADD CONSTRAINT "mock_exams_exam_goal_id_fk" FOREIGN KEY ("exam_goal_id") REFERENCES "public"."student_exam_goals"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mock_exam_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mock_exam_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"topic" text NOT NULL,
	"qtype" text NOT NULL,
	"prompt" text NOT NULL,
	"options" jsonb,
	"correct_key" text,
	"marking_note" text,
	"marks" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "mock_exam_questions_exam_sequence_uq" UNIQUE ("mock_exam_id","sequence")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mock_exam_questions" ADD CONSTRAINT "mock_exam_questions_mock_exam_id_fk" FOREIGN KEY ("mock_exam_id") REFERENCES "public"."mock_exams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mock_exam_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mock_exam_id" uuid NOT NULL,
	"attempt_no" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"results" jsonb,
	CONSTRAINT "mock_exam_attempts_exam_attempt_uq" UNIQUE ("mock_exam_id","attempt_no")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mock_exam_attempts" ADD CONSTRAINT "mock_exam_attempts_mock_exam_id_fk" FOREIGN KEY ("mock_exam_id") REFERENCES "public"."mock_exams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mock_exam_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"choice_key" text,
	"answer_text" text,
	"photo_object_id" uuid,
	"flagged" boolean DEFAULT false NOT NULL,
	"evaluation" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_exam_answers_attempt_question_uq" UNIQUE ("attempt_id","question_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mock_exam_answers" ADD CONSTRAINT "mock_exam_answers_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."mock_exam_attempts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mock_exam_answers" ADD CONSTRAINT "mock_exam_answers_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."mock_exam_questions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mock_exam_answers" ADD CONSTRAINT "mock_exam_answers_photo_object_id_fk" FOREIGN KEY ("photo_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
