-- Plan 01: generalized student storage objects.

CREATE TABLE IF NOT EXISTS "storage_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid,
	"owner_student_id" uuid,
	"owner_independent_user_id" uuid,
	"owner_staff_user_id" uuid,
	"kind" text NOT NULL,
	"driver" text NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum_sha256" text,
	"processing_status" text DEFAULT 'uploaded' NOT NULL,
	"processing_error" text,
	"derived" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_owner_student_id_fk" FOREIGN KEY ("owner_student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_owner_independent_user_id_fk" FOREIGN KEY ("owner_independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_owner_staff_user_id_fk" FOREIGN KEY ("owner_staff_user_id") REFERENCES "public"."institution_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_objects_inst_idx" ON "storage_objects" ("institution_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_objects_owner_student_idx" ON "storage_objects" ("owner_student_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_objects_owner_indep_idx" ON "storage_objects" ("owner_independent_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_objects_kind_idx" ON "storage_objects" ("kind");
