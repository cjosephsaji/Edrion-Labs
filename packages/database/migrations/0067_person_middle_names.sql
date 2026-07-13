ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "middle_name" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "middle_name" text;--> statement-breakpoint
ALTER TABLE "admission_applications" ADD COLUMN IF NOT EXISTS "middle_name" text;
