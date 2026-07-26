CREATE TABLE IF NOT EXISTS "portal_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"institution_user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"institution_user_id" uuid NOT NULL,
	"idp_session_id" text,
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
ALTER TABLE "institution_users" ADD COLUMN "last_auth_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "institution_users" ADD COLUMN "failed_login_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "institution_users" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portal_invitations" ADD CONSTRAINT "portal_invitations_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portal_invitations" ADD CONSTRAINT "portal_invitations_institution_user_id_institution_users_id_fk" FOREIGN KEY ("institution_user_id") REFERENCES "public"."institution_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_institution_user_id_institution_users_id_fk" FOREIGN KEY ("institution_user_id") REFERENCES "public"."institution_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_invitation_institution_idx" ON "portal_invitations" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_invitation_user_idx" ON "portal_invitations" USING btree ("institution_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_session_institution_idx" ON "portal_sessions" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_session_user_idx" ON "portal_sessions" USING btree ("institution_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_session_active_idx" ON "portal_sessions" USING btree ("revoked_at","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "institution_users_email_idx" ON "institution_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_institution_occurred_idx" ON "audit_events" USING btree ("institution_id","occurred_at");