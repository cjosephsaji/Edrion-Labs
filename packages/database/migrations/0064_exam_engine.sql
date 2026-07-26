-- Exam engine: paper patterns, blueprints, question bank, exposure; extend mock_* tables.

CREATE TABLE IF NOT EXISTS "exam_paper_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"board" text NOT NULL,
	"level_label" text NOT NULL,
	"duration_min" integer NOT NULL,
	"total_marks" integer NOT NULL,
	"sections" jsonb NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exam_paper_patterns_key_uq" ON "exam_paper_patterns" ("key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "exam_blueprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid,
	"student_id" uuid,
	"independent_user_id" uuid,
	"paper_pattern_id" uuid,
	"source_kind" text DEFAULT 'studied' NOT NULL,
	"blueprint" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_blueprints_owner_ck" CHECK (
		("student_id" IS NOT NULL AND "independent_user_id" IS NULL)
		OR ("student_id" IS NULL AND "independent_user_id" IS NOT NULL)
	)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_blueprints" ADD CONSTRAINT "exam_blueprints_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_blueprints" ADD CONSTRAINT "exam_blueprints_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_blueprints" ADD CONSTRAINT "exam_blueprints_independent_user_id_fk" FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_blueprints" ADD CONSTRAINT "exam_blueprints_paper_pattern_id_fk" FOREIGN KEY ("paper_pattern_id") REFERENCES "public"."exam_paper_patterns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_blueprints_owner_idx" ON "exam_blueprints" ("student_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_blueprints_indep_idx" ON "exam_blueprints" ("independent_user_id","created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "question_bank" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_key" text NOT NULL,
	"topic_label" text NOT NULL,
	"qtype" text NOT NULL,
	"difficulty" text NOT NULL,
	"curriculum_key" text DEFAULT 'general' NOT NULL,
	"prompt_hash" text NOT NULL,
	"prompt_version" text DEFAULT 'exam-v1' NOT NULL,
	"payload" jsonb NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "question_bank_lookup_uq" ON "question_bank" ("topic_key","qtype","difficulty","curriculum_key","prompt_hash","prompt_version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_bank_topic_idx" ON "question_bank" ("topic_key","qtype","difficulty");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "question_exposure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid,
	"independent_user_id" uuid,
	"question_bank_id" uuid NOT NULL,
	"exposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_exposure_owner_ck" CHECK (
		("student_id" IS NOT NULL AND "independent_user_id" IS NULL)
		OR ("student_id" IS NULL AND "independent_user_id" IS NOT NULL)
	)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_exposure" ADD CONSTRAINT "question_exposure_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_exposure" ADD CONSTRAINT "question_exposure_independent_user_id_fk" FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_exposure" ADD CONSTRAINT "question_exposure_question_bank_id_fk" FOREIGN KEY ("question_bank_id") REFERENCES "public"."question_bank"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "question_exposure_student_bank_uq" ON "question_exposure" ("student_id","question_bank_id") WHERE "student_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "question_exposure_indep_bank_uq" ON "question_exposure" ("independent_user_id","question_bank_id") WHERE "independent_user_id" IS NOT NULL;
--> statement-breakpoint

ALTER TABLE "mock_exams" ADD COLUMN IF NOT EXISTS "blueprint_id" uuid;
--> statement-breakpoint
ALTER TABLE "mock_exams" ADD COLUMN IF NOT EXISTS "source_kind" text;
--> statement-breakpoint
ALTER TABLE "mock_exams" ADD COLUMN IF NOT EXISTS "generation_notice" text;
--> statement-breakpoint
ALTER TABLE "mock_exams" ADD COLUMN IF NOT EXISTS "grading_status" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mock_exams" ADD CONSTRAINT "mock_exams_blueprint_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."exam_blueprints"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mock_exams_blueprint_idx" ON "mock_exams" ("blueprint_id");
--> statement-breakpoint

ALTER TABLE "mock_exam_questions" ADD COLUMN IF NOT EXISTS "section_id" text;
--> statement-breakpoint
ALTER TABLE "mock_exam_questions" ADD COLUMN IF NOT EXISTS "difficulty" text;
--> statement-breakpoint
ALTER TABLE "mock_exam_questions" ADD COLUMN IF NOT EXISTS "payload" jsonb;
--> statement-breakpoint
ALTER TABLE "mock_exam_questions" ADD COLUMN IF NOT EXISTS "question_bank_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mock_exam_questions" ADD CONSTRAINT "mock_exam_questions_question_bank_id_fk" FOREIGN KEY ("question_bank_id") REFERENCES "public"."question_bank"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

ALTER TABLE "mock_exam_attempts" ADD COLUMN IF NOT EXISTS "paused_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "mock_exam_attempts" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'in_progress' NOT NULL;
--> statement-breakpoint
ALTER TABLE "mock_exam_attempts" ADD COLUMN IF NOT EXISTS "server_clock_skew_ms" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mock_exam_attempts_status_idx" ON "mock_exam_attempts" ("status","ends_at");
--> statement-breakpoint

ALTER TABLE "mock_exam_answers" ADD COLUMN IF NOT EXISTS "answer_payload" jsonb;
--> statement-breakpoint
ALTER TABLE "mock_exam_answers" ADD COLUMN IF NOT EXISTS "client_updated_at" timestamp with time zone;
--> statement-breakpoint

-- Seed three paper-pattern presets (idempotent on key).
INSERT INTO "exam_paper_patterns" ("id", "key", "name", "board", "level_label", "duration_min", "total_marks", "sections", "description")
VALUES
(
  'a1000000-0000-4000-8000-000000000001',
  'cbse_8_10',
  'CBSE Class 8–10 pattern',
  'CBSE',
  'Class 8–10',
  90,
  80,
  '[
    {"id":"sec-a","name":"Section A — Objective","questionCount":20,"questionTypes":["mcq_single","assertion_reason","fill_blank"],"marksPerQuestion":1},
    {"id":"sec-b","name":"Section B — Short answers","questionCount":6,"questionTypes":["short_answer","numerical","match_following"],"marksPerQuestion":3},
    {"id":"sec-c","name":"Section C — Long answers","questionCount":4,"questionTypes":["long_answer","case_based"],"marksPerQuestion":5}
  ]'::jsonb,
  'Typical CBSE secondary paper: objective warm-up, short answers, then long/case.'
),
(
  'a1000000-0000-4000-8000-000000000002',
  'ktu_university',
  'KTU-style university pattern',
  'KTU',
  'Undergraduate',
  180,
  100,
  '[
    {"id":"part-a","name":"Part A — Short","questionCount":10,"questionTypes":["short_answer","numerical","mcq_single"],"marksPerQuestion":3},
    {"id":"part-b","name":"Part B — Descriptive","questionCount":5,"questionTypes":["long_answer","case_based"],"marksPerQuestion":14}
  ]'::jsonb,
  'Generic Kerala Technological University style: short Part A, long Part B.'
),
(
  'a1000000-0000-4000-8000-000000000003',
  'chapter_test',
  'Chapter test',
  'general',
  'Any level',
  30,
  25,
  '[
    {"id":"sec-obj","name":"Objective","questionCount":10,"questionTypes":["mcq_single","mcq_multi","assertion_reason","fill_blank"],"marksPerQuestion":1},
    {"id":"sec-short","name":"Short / Numerical","questionCount":5,"questionTypes":["short_answer","numerical"],"marksPerQuestion":3}
  ]'::jsonb,
  'Compact mixed chapter test for a single unit of study.'
)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "board" = EXCLUDED."board",
  "level_label" = EXCLUDED."level_label",
  "duration_min" = EXCLUDED."duration_min",
  "total_marks" = EXCLUDED."total_marks",
  "sections" = EXCLUDED."sections",
  "description" = EXCLUDED."description",
  "updated_at" = now();
