-- Petros Phase 1: conversation/message/artifact/attachment/pending-turn persistence, plus the
-- run link columns on portal_ai_runs (a chat turn that raises a mutation creates a run and the
-- message stores its id — THE confirmation invariant is unchanged).

CREATE TABLE IF NOT EXISTS "petros_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"institution_user_id" uuid NOT NULL,
	"title" text,
	"status" text DEFAULT 'active' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"summary" text,
	"last_message_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "petros_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'complete' NOT NULL,
	"run_id" uuid,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cached_input_tokens" integer,
	"stop_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "petros_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid,
	"institution_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"doc_type" text,
	"storage_path" text,
	"mime_type" text,
	"size_bytes" integer,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "petros_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"institution_user_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"parse_status" text DEFAULT 'pending' NOT NULL,
	"openai_file_id" text,
	"extracted_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "petros_pending_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"run_id" uuid,
	"message_id" uuid NOT NULL,
	"api_input" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pending_call_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "petros_conversations" ADD CONSTRAINT "petros_conversations_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "petros_conversations" ADD CONSTRAINT "petros_conversations_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "petros_messages" ADD CONSTRAINT "petros_messages_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."petros_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "petros_messages" ADD CONSTRAINT "petros_messages_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "petros_artifacts" ADD CONSTRAINT "petros_artifacts_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."petros_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "petros_artifacts" ADD CONSTRAINT "petros_artifacts_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."petros_messages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "petros_artifacts" ADD CONSTRAINT "petros_artifacts_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "petros_attachments" ADD CONSTRAINT "petros_attachments_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."petros_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "petros_attachments" ADD CONSTRAINT "petros_attachments_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "petros_pending_turns" ADD CONSTRAINT "petros_pending_turns_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."petros_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "petros_pending_turns" ADD CONSTRAINT "petros_pending_turns_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "petros_pending_turns" ADD CONSTRAINT "petros_pending_turns_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."petros_messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "petros_conversations_owner_idx" ON "petros_conversations" USING btree ("institution_id","institution_user_id","last_message_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "petros_conversations_institution_idx" ON "petros_conversations" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "petros_messages_conversation_idx" ON "petros_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "petros_messages_institution_idx" ON "petros_messages" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "petros_artifacts_conversation_idx" ON "petros_artifacts" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "petros_artifacts_institution_idx" ON "petros_artifacts" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "petros_attachments_conversation_idx" ON "petros_attachments" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "petros_attachments_institution_idx" ON "petros_attachments" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "petros_pending_turns_conversation_idx" ON "petros_pending_turns" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "petros_pending_turns_institution_idx" ON "petros_pending_turns" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "petros_pending_turns_one_active" ON "petros_pending_turns" ("conversation_id") WHERE status = 'pending';--> statement-breakpoint
ALTER TABLE "portal_ai_runs" ADD COLUMN IF NOT EXISTS "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "portal_ai_runs" ADD COLUMN IF NOT EXISTS "message_id" uuid;
