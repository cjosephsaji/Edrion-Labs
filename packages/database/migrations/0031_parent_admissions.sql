ALTER TABLE "admission_applications" ADD COLUMN IF NOT EXISTS "academic_year_id" uuid;--> statement-breakpoint
ALTER TABLE "admission_applications" ADD COLUMN IF NOT EXISTS "submitted_via" text DEFAULT 'staff' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admission_application_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"resume_token_hash" text NOT NULL,
	"contact_email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_application_id" uuid,
	"expires_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admission_application_drafts" ADD CONSTRAINT "admission_application_drafts_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admission_application_drafts" ADD CONSTRAINT "admission_application_drafts_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admission_application_drafts" ADD CONSTRAINT "admission_application_drafts_submitted_application_id_admission_applications_id_fk" FOREIGN KEY ("submitted_application_id") REFERENCES "public"."admission_applications"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_drafts_institution_idx" ON "admission_application_drafts" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_drafts_token_idx" ON "admission_application_drafts" USING btree ("resume_token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_drafts_email_idx" ON "admission_application_drafts" USING btree ("contact_email");
