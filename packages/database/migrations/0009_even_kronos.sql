CREATE TABLE IF NOT EXISTS "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
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
ALTER TABLE "platform_employees" ADD COLUMN "failed_login_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_employees" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_employee_id_platform_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."platform_employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_session_employee_idx" ON "auth_sessions" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_session_active_idx" ON "auth_sessions" USING btree ("revoked_at","expires_at");