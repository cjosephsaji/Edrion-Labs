ALTER TABLE "subscriptions" ADD COLUMN "discount_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "credit_balance_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "overage_policy" text DEFAULT 'block' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "usage_limits_override" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "scheduled_plan_version_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "scheduled_billing_cycle" "billing_cycle";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "scheduled_change_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancel_reason" text;