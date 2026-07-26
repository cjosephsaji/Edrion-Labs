CREATE TABLE IF NOT EXISTS "admission_application_otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
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
DO $$ BEGIN
 ALTER TABLE "admission_application_otps" ADD CONSTRAINT "admission_application_otps_draft_id_admission_application_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."admission_application_drafts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_otps_draft_idx" ON "admission_application_otps" USING btree ("draft_id","purpose");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_otps_email_idx" ON "admission_application_otps" USING btree ("email");
