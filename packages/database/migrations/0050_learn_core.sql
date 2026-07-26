-- Plan 02: learn core — topics, paths, sessions, attempts, quick answers.

CREATE TABLE IF NOT EXISTS "learn_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_key" text NOT NULL,
	"title" text NOT NULL,
	"subject_label" text NOT NULL,
	"curriculum_key" text DEFAULT 'generic' NOT NULL,
	"domain_archetype" text DEFAULT 'procedural_quantitative' NOT NULL,
	"institution_id" uuid,
	"source" text DEFAULT 'ai' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learn_topics_key_curriculum_uq" UNIQUE ("topic_key","curriculum_key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learn_topics" ADD CONSTRAINT "learn_topics_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "concept_atoms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"atom_kind" text NOT NULL,
	"variant_key" text DEFAULT 'default' NOT NULL,
	"content" jsonb NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concept_atoms_topic_kind_variant_prompt_uq" UNIQUE ("topic_id","atom_kind","variant_key","prompt_version")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "concept_atoms" ADD CONSTRAINT "concept_atoms_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learn_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_paths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid,
	"student_id" uuid,
	"independent_user_id" uuid,
	"title" text NOT NULL,
	"subject_label" text NOT NULL,
	"source" text NOT NULL,
	"meta_line" text,
	"goal" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "learning_paths_subject_ck" CHECK (
		("student_id" IS NOT NULL AND "independent_user_id" IS NULL)
		OR ("student_id" IS NULL AND "independent_user_id" IS NOT NULL)
	)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_paths" ADD CONSTRAINT "learning_paths_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_paths" ADD CONSTRAINT "learning_paths_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_paths" ADD CONSTRAINT "learning_paths_independent_user_id_fk" FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_path_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"why_here" text,
	"optional_branch" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"completed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "learning_path_items_path_sequence_uq" UNIQUE ("path_id","sequence")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_path_items" ADD CONSTRAINT "learning_path_items_path_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."learning_paths"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_path_items" ADD CONSTRAINT "learning_path_items_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learn_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learn_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid,
	"student_id" uuid,
	"independent_user_id" uuid,
	"topic_id" uuid NOT NULL,
	"path_item_id" uuid,
	"grounding_knowledge_item_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"spine" jsonb NOT NULL,
	"session_plan" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paused_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "learn_sessions_subject_ck" CHECK (
		("student_id" IS NOT NULL AND "independent_user_id" IS NULL)
		OR ("student_id" IS NULL AND "independent_user_id" IS NOT NULL)
	)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learn_sessions" ADD CONSTRAINT "learn_sessions_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learn_sessions" ADD CONSTRAINT "learn_sessions_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learn_sessions" ADD CONSTRAINT "learn_sessions_independent_user_id_fk" FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learn_sessions" ADD CONSTRAINT "learn_sessions_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learn_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learn_sessions" ADD CONSTRAINT "learn_sessions_path_item_id_fk" FOREIGN KEY ("path_item_id") REFERENCES "public"."learning_path_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learn_sessions_student_idx" ON "learn_sessions" ("student_id","started_at" DESC) WHERE "student_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learn_sessions_indep_idx" ON "learn_sessions" ("independent_user_id","started_at" DESC) WHERE "independent_user_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learn_session_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"block_type" text NOT NULL,
	"spine_step" text NOT NULL,
	"content" jsonb NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learn_session_blocks_session_sequence_uq" UNIQUE ("session_id","sequence")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learn_session_blocks" ADD CONSTRAINT "learn_session_blocks_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learn_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learn_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"block_id" uuid,
	"student_id" uuid,
	"independent_user_id" uuid,
	"kind" text NOT NULL,
	"input" jsonb NOT NULL,
	"evaluation" jsonb NOT NULL,
	"hints_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learn_attempts" ADD CONSTRAINT "learn_attempts_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learn_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learn_attempts" ADD CONSTRAINT "learn_attempts_block_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."learn_session_blocks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learn_attempts" ADD CONSTRAINT "learn_attempts_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learn_attempts" ADD CONSTRAINT "learn_attempts_independent_user_id_fk" FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quick_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid,
	"student_id" uuid,
	"independent_user_id" uuid,
	"question" text NOT NULL,
	"answer_short" text NOT NULL,
	"answer_detail" text NOT NULL,
	"visual" jsonb,
	"on_learning_list" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quick_answers_subject_ck" CHECK (
		("student_id" IS NOT NULL AND "independent_user_id" IS NULL)
		OR ("student_id" IS NULL AND "independent_user_id" IS NOT NULL)
	)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quick_answers" ADD CONSTRAINT "quick_answers_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quick_answers" ADD CONSTRAINT "quick_answers_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quick_answers" ADD CONSTRAINT "quick_answers_independent_user_id_fk" FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
