ALTER TABLE "plan_versions" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "updated_by" uuid;