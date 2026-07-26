-- Library: real ingestion pages, SM-2 flashcard fields, quiz attempts, item status.

ALTER TABLE "knowledge_items"
	ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'ready' NOT NULL,
	ADD COLUMN IF NOT EXISTS "pages_done" integer DEFAULT 0 NOT NULL,
	ADD COLUMN IF NOT EXISTS "error_message" text;
--> statement-breakpoint
ALTER TABLE "knowledge_artifacts"
	ADD COLUMN IF NOT EXISTS "last_interacted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "flashcards"
	ADD COLUMN IF NOT EXISTS "ease" numeric(4, 2) DEFAULT 2.50 NOT NULL,
	ADD COLUMN IF NOT EXISTS "reps" integer DEFAULT 0 NOT NULL,
	ADD COLUMN IF NOT EXISTS "lapses" integer DEFAULT 0 NOT NULL,
	ADD COLUMN IF NOT EXISTS "source_page" integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_item_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"page_index" integer NOT NULL,
	"object_id" uuid NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"ocr_confidence" numeric(4, 3),
	"needs_confirm" boolean DEFAULT false NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_item_pages_item_page_uq" UNIQUE ("item_id", "page_index")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_item_pages" ADD CONSTRAINT "knowledge_item_pages_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_item_pages" ADD CONSTRAINT "knowledge_item_pages_object_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."storage_objects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_item_pages_item_idx" ON "knowledge_item_pages" ("item_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"institution_id" uuid,
	"student_id" uuid,
	"independent_user_id" uuid,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"patterns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_quiz_attempts_subject_ck" CHECK (
		("student_id" IS NOT NULL AND "independent_user_id" IS NULL)
		OR ("student_id" IS NULL AND "independent_user_id" IS NOT NULL)
	)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "library_quiz_attempts" ADD CONSTRAINT "library_quiz_attempts_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."knowledge_artifacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "library_quiz_attempts" ADD CONSTRAINT "library_quiz_attempts_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "library_quiz_attempts" ADD CONSTRAINT "library_quiz_attempts_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "library_quiz_attempts" ADD CONSTRAINT "library_quiz_attempts_independent_user_id_fk" FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_quiz_attempts_artifact_idx" ON "library_quiz_attempts" ("artifact_id", "finished_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_quiz_attempts_owner_idx" ON "library_quiz_attempts" ("student_id", "finished_at" DESC) WHERE "student_id" IS NOT NULL;
