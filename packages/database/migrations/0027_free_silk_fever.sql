ALTER TABLE "health_records" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "health_records" ADD COLUMN "symptoms" text;--> statement-breakpoint
ALTER TABLE "health_records" ADD COLUMN "action_taken" text;--> statement-breakpoint
ALTER TABLE "health_records" ADD COLUMN "treatment" text;--> statement-breakpoint
ALTER TABLE "health_records" ADD COLUMN "attended_by" text;--> statement-breakpoint
ALTER TABLE "health_records" ADD COLUMN "follow_up_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "health_records" ADD COLUMN "follow_up_at" date;--> statement-breakpoint
ALTER TABLE "medical_incidents" ADD COLUMN "action_taken" text;--> statement-breakpoint
ALTER TABLE "medical_incidents" ADD COLUMN "treatment" text;--> statement-breakpoint
ALTER TABLE "medical_incidents" ADD COLUMN "attended_by" text;--> statement-breakpoint
ALTER TABLE "medical_incidents" ADD COLUMN "follow_up_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "medical_incidents" ADD COLUMN "follow_up_at" date;--> statement-breakpoint
ALTER TABLE "medication_logs" ADD COLUMN "administered_by" text;