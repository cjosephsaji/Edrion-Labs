ALTER TABLE "platform_employees" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "platform_employees" ADD COLUMN "password_reset_token_hash" text;--> statement-breakpoint
ALTER TABLE "platform_employees" ADD COLUMN "password_reset_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "institution_users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "institution_users" ADD COLUMN "activation_token_hash" text;--> statement-breakpoint
ALTER TABLE "institution_users" ADD COLUMN "activation_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "institution_users" ADD COLUMN "password_reset_token_hash" text;--> statement-breakpoint
ALTER TABLE "institution_users" ADD COLUMN "password_reset_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "institution_users" ADD COLUMN "activated_at" timestamp with time zone;