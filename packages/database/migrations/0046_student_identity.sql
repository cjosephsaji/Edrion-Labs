-- Plan 01: student identity — link students to portal accounts + independent auth + sessions.

ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "institution_user_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "students" ADD CONSTRAINT "students_institution_user_id_fk" FOREIGN KEY ("institution_user_id") REFERENCES "public"."institution_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "students_institution_user_id_uq" ON "students" ("institution_user_id") WHERE "institution_user_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "independent_users" ADD COLUMN IF NOT EXISTS "password_hash" text;
--> statement-breakpoint
ALTER TABLE "independent_users" ADD COLUMN IF NOT EXISTS "activation_token_hash" text;
--> statement-breakpoint
ALTER TABLE "independent_users" ADD COLUMN IF NOT EXISTS "activation_token_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "independent_users" ADD COLUMN IF NOT EXISTS "password_reset_token_hash" text;
--> statement-breakpoint
ALTER TABLE "independent_users" ADD COLUMN IF NOT EXISTS "password_reset_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "independent_users" ADD COLUMN IF NOT EXISTS "activated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "independent_users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "independent_users" ADD COLUMN IF NOT EXISTS "last_auth_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "independent_users" ADD COLUMN IF NOT EXISTS "failed_login_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "independent_users" ADD COLUMN IF NOT EXISTS "locked_until" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "independent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"independent_user_id" uuid NOT NULL,
	"aal" text DEFAULT 'aal1' NOT NULL,
	"last_auth_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "independent_sessions" ADD CONSTRAINT "independent_sessions_independent_user_id_fk" FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "independent_sessions_user_idx" ON "independent_sessions" ("independent_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "independent_sessions_live_idx" ON "independent_sessions" ("revoked_at","expires_at");
