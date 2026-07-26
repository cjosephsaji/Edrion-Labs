CREATE TYPE "public"."registration_review_action" AS ENUM('assigned', 'started_review', 'note_added', 'approved', 'rejected', 'info_requested', 'status_changed');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn', 'info_requested');--> statement-breakpoint
ALTER TYPE "public"."actor_type" ADD VALUE 'applicant';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "institution_onboarding_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "institution_registration_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"storage_key" text NOT NULL,
	"kind" text,
	"uploaded_by_employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "institution_registration_otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"email" text NOT NULL,
	"purpose" text DEFAULT 'email_verification' NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"send_count" integer DEFAULT 1 NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "institution_registration_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_ref" text,
	"status" "registration_status" DEFAULT 'draft' NOT NULL,
	"legal_name" text,
	"display_name" text,
	"type" "institution_type",
	"country" text,
	"region" text,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"campuses_count" integer,
	"expected_students" integer,
	"preferred_plan_key" text,
	"institution_info" jsonb,
	"location" jsonb,
	"campus_info" jsonb,
	"primary_contact" jsonb,
	"subscription" jsonb,
	"consent" jsonb,
	"email_verified_at" timestamp with time zone,
	"verified_email" text,
	"assigned_reviewer_id" uuid,
	"decided_by" uuid,
	"decision_at" timestamp with time zone,
	"rejection_reason" text,
	"linked_institution_id" uuid,
	"submitter_ip" text,
	"submitter_user_agent" text,
	"correlation_id" text,
	"submitted_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institution_registration_requests_public_ref_unique" UNIQUE("public_ref")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "institution_registration_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"action" "registration_review_action" NOT NULL,
	"from_status" text,
	"to_status" text,
	"note" text,
	"rejection_reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "institution_onboarding_tasks" ADD CONSTRAINT "institution_onboarding_tasks_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "institution_registration_attachments" ADD CONSTRAINT "institution_registration_attachments_request_id_institution_registration_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."institution_registration_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "institution_registration_attachments" ADD CONSTRAINT "institution_registration_attachments_uploaded_by_employee_id_platform_employees_id_fk" FOREIGN KEY ("uploaded_by_employee_id") REFERENCES "public"."platform_employees"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "institution_registration_otps" ADD CONSTRAINT "institution_registration_otps_request_id_institution_registration_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."institution_registration_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "institution_registration_requests" ADD CONSTRAINT "institution_registration_requests_assigned_reviewer_id_platform_employees_id_fk" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "public"."platform_employees"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "institution_registration_requests" ADD CONSTRAINT "institution_registration_requests_decided_by_platform_employees_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."platform_employees"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "institution_registration_requests" ADD CONSTRAINT "institution_registration_requests_linked_institution_id_institutions_id_fk" FOREIGN KEY ("linked_institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "institution_registration_reviews" ADD CONSTRAINT "institution_registration_reviews_request_id_institution_registration_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."institution_registration_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "institution_registration_reviews" ADD CONSTRAINT "institution_registration_reviews_reviewer_id_platform_employees_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."platform_employees"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_tasks_institution_idx" ON "institution_onboarding_tasks" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reg_attachments_request_idx" ON "institution_registration_attachments" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reg_otps_request_idx" ON "institution_registration_otps" USING btree ("request_id","purpose");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reg_otps_email_idx" ON "institution_registration_otps" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reg_requests_status_idx" ON "institution_registration_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reg_requests_type_idx" ON "institution_registration_requests" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reg_requests_country_idx" ON "institution_registration_requests" USING btree ("country");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reg_requests_contact_email_idx" ON "institution_registration_requests" USING btree ("contact_email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reg_requests_reviewer_idx" ON "institution_registration_requests" USING btree ("assigned_reviewer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reg_requests_submitted_idx" ON "institution_registration_requests" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reg_reviews_request_idx" ON "institution_registration_reviews" USING btree ("request_id","created_at");