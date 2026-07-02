CREATE TABLE IF NOT EXISTS "student_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"student_id" uuid NOT NULL,
	"category" text DEFAULT 'behavior' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"severity" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"occurred_on" date,
	"reporter_name" text,
	"notify_guardians" boolean DEFAULT false NOT NULL,
	"resolution_note" text,
	"resolved_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_incidents" ADD CONSTRAINT "student_incidents_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_incidents" ADD CONSTRAINT "student_incidents_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_incidents" ADD CONSTRAINT "student_incidents_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_incidents_institution_idx" ON "student_incidents" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_incidents_institution_campus_idx" ON "student_incidents" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_incidents_student_idx" ON "student_incidents" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_incidents_status_idx" ON "student_incidents" USING btree ("status");
