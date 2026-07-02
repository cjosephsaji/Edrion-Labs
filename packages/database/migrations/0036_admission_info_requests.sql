CREATE TABLE IF NOT EXISTS "admission_info_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"message" text,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resume_token_hash" text NOT NULL,
	"contact_email" text,
	"responses" jsonb,
	"submitted_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admission_info_requests" ADD CONSTRAINT "admission_info_requests_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admission_info_requests" ADD CONSTRAINT "admission_info_requests_application_id_admission_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."admission_applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_info_requests_institution_idx" ON "admission_info_requests" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_info_requests_application_idx" ON "admission_info_requests" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_info_requests_status_idx" ON "admission_info_requests" USING btree ("status");
