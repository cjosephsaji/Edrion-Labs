CREATE TABLE IF NOT EXISTS "conversation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"participant_type" text NOT NULL,
	"participant_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"last_read_at" timestamp with time zone,
	"added_by" uuid,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"title" text,
	"is_group" boolean DEFAULT false NOT NULL,
	"last_message_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text,
	"size_bytes" integer,
	"storage_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_type" text NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"reply_to_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_participants_institution_idx" ON "conversation_participants" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_participants_conversation_idx" ON "conversation_participants" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_participants_who_idx" ON "conversation_participants" USING btree ("participant_type","participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_participant_uniq" ON "conversation_participants" USING btree ("conversation_id","participant_type","participant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_institution_idx" ON "conversations" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_institution_campus_idx" ON "conversations" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_last_message_idx" ON "conversations" USING btree ("institution_id","last_message_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_attachments_institution_idx" ON "message_attachments" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_attachments_message_idx" ON "message_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_institution_idx" ON "messages" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");