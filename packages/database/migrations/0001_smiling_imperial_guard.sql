ALTER TABLE "institution_users" ADD COLUMN "require_mfa" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "institution_users" ADD COLUMN "direct_grants" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "institution_users" ADD COLUMN "direct_denies" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "institution_users" ADD COLUMN "password_reset_required_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "institution_users" ADD COLUMN "sessions_revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "institution_users" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "institution_users" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "institution_users" ADD COLUMN "disabled_reason" text;