CREATE TABLE IF NOT EXISTS "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"title" text NOT NULL,
	"body" text,
	"reference_code" text NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"category" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"publish_at" date,
	"published_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"title" text NOT NULL,
	"body" text,
	"kind" text DEFAULT 'system' NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"announcement_id" uuid,
	"status" text DEFAULT 'unread' NOT NULL,
	"read_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"body" text NOT NULL,
	"author_name" text,
	"sender_type" text DEFAULT 'staff' NOT NULL,
	"posted_date" date,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"subject" text NOT NULL,
	"reference_code" text NOT NULL,
	"category" text,
	"status" text DEFAULT 'open' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"name" text NOT NULL,
	"report_type" text DEFAULT 'custom' NOT NULL,
	"reference_code" text NOT NULL,
	"description" text,
	"config" text,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"format" text DEFAULT 'csv' NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"generated_date" date,
	"notes" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcements" ADD CONSTRAINT "announcements_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcements" ADD CONSTRAINT "announcements_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_posts" ADD CONSTRAINT "message_posts_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_posts" ADD CONSTRAINT "message_posts_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_definitions" ADD CONSTRAINT "report_definitions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_definitions" ADD CONSTRAINT "report_definitions_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_report_id_report_definitions_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report_definitions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcements_institution_idx" ON "announcements" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcements_institution_campus_idx" ON "announcements" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcements_status_idx" ON "announcements" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "announcement_code_uniq" ON "announcements" USING btree ("institution_id","reference_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_institution_idx" ON "notifications" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_institution_campus_idx" ON "notifications" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_status_idx" ON "notifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_announcement_idx" ON "notifications" USING btree ("announcement_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_posts_institution_idx" ON "message_posts" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_posts_thread_idx" ON "message_posts" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_threads_institution_idx" ON "message_threads" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_threads_institution_campus_idx" ON "message_threads" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_threads_status_idx" ON "message_threads" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "message_thread_code_uniq" ON "message_threads" USING btree ("institution_id","reference_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_definitions_institution_idx" ON "report_definitions" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_definitions_institution_campus_idx" ON "report_definitions" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_definitions_status_idx" ON "report_definitions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "report_definition_code_uniq" ON "report_definitions" USING btree ("institution_id","reference_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_runs_institution_idx" ON "report_runs" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_runs_report_idx" ON "report_runs" USING btree ("report_id");