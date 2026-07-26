CREATE TABLE IF NOT EXISTS "health_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"student_id" uuid,
	"record_type" text DEFAULT 'note' NOT NULL,
	"title" text NOT NULL,
	"details" text,
	"blood_group" text,
	"status" text DEFAULT 'active' NOT NULL,
	"recorded_at" date,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "medical_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"student_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"severity" text DEFAULT 'low' NOT NULL,
	"location" text,
	"occurred_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "medication_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"student_id" uuid,
	"medication" text NOT NULL,
	"dosage" text,
	"administered_at" timestamp with time zone,
	"notes" text,
	"status" text DEFAULT 'administered' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "counseling_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"student_id" uuid,
	"title" text NOT NULL,
	"summary" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "counseling_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"student_id" uuid,
	"session_type" text DEFAULT 'individual' NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"session_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lab_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"name" text NOT NULL,
	"kind" text DEFAULT 'equipment' NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"unit" text,
	"location" text,
	"status" text DEFAULT 'available' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lab_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"severity" text DEFAULT 'low' NOT NULL,
	"occurred_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lab_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"lab_name" text NOT NULL,
	"title" text NOT NULL,
	"scheduled_at" timestamp with time zone,
	"duration_minutes" integer,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"visitor_name" text NOT NULL,
	"with_whom" text,
	"scheduled_at" timestamp with time zone,
	"notes" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"full_name" text NOT NULL,
	"purpose" text,
	"host" text,
	"badge_no" text,
	"check_in_at" timestamp with time zone,
	"check_out_at" timestamp with time zone,
	"status" text DEFAULT 'checked_in' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "facilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"name" text NOT NULL,
	"kind" text DEFAULT 'room' NOT NULL,
	"location" text,
	"status" text DEFAULT 'operational' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "facility_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"name" text NOT NULL,
	"category" text,
	"location" text,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "maintenance_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"title" text NOT NULL,
	"frequency" text DEFAULT 'monthly' NOT NULL,
	"next_due_at" date,
	"notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"assigned_to" text,
	"due_at" date,
	"status" text DEFAULT 'open' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campus_access_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"subject_name" text NOT NULL,
	"direction" text DEFAULT 'in' NOT NULL,
	"gate" text,
	"method" text DEFAULT 'badge' NOT NULL,
	"occurred_at" timestamp with time zone,
	"status" text DEFAULT 'recorded' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "emergency_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"title" text NOT NULL,
	"message" text,
	"level" text DEFAULT 'info' NOT NULL,
	"raised_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gate_passes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"holder_name" text NOT NULL,
	"kind" text DEFAULT 'visitor' NOT NULL,
	"reason" text,
	"issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "security_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"severity" text DEFAULT 'low' NOT NULL,
	"location" text,
	"occurred_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"requester_name" text NOT NULL,
	"system" text,
	"reason" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"name" text NOT NULL,
	"kind" text DEFAULT 'laptop' NOT NULL,
	"asset_tag" text,
	"assigned_to" text,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_records" ADD CONSTRAINT "health_records_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_records" ADD CONSTRAINT "health_records_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_records" ADD CONSTRAINT "health_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "medical_incidents" ADD CONSTRAINT "medical_incidents_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "medical_incidents" ADD CONSTRAINT "medical_incidents_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "medical_incidents" ADD CONSTRAINT "medical_incidents_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "medication_logs" ADD CONSTRAINT "medication_logs_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "medication_logs" ADD CONSTRAINT "medication_logs_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "medication_logs" ADD CONSTRAINT "medication_logs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "counseling_cases" ADD CONSTRAINT "counseling_cases_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "counseling_cases" ADD CONSTRAINT "counseling_cases_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "counseling_cases" ADD CONSTRAINT "counseling_cases_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "counseling_records" ADD CONSTRAINT "counseling_records_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "counseling_records" ADD CONSTRAINT "counseling_records_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "counseling_records" ADD CONSTRAINT "counseling_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lab_assets" ADD CONSTRAINT "lab_assets_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lab_assets" ADD CONSTRAINT "lab_assets_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lab_incidents" ADD CONSTRAINT "lab_incidents_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lab_incidents" ADD CONSTRAINT "lab_incidents_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lab_schedules" ADD CONSTRAINT "lab_schedules_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lab_schedules" ADD CONSTRAINT "lab_schedules_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visitors" ADD CONSTRAINT "visitors_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visitors" ADD CONSTRAINT "visitors_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "facilities" ADD CONSTRAINT "facilities_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "facilities" ADD CONSTRAINT "facilities_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "facility_assets" ADD CONSTRAINT "facility_assets_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "facility_assets" ADD CONSTRAINT "facility_assets_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campus_access_logs" ADD CONSTRAINT "campus_access_logs_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campus_access_logs" ADD CONSTRAINT "campus_access_logs_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "emergency_alerts" ADD CONSTRAINT "emergency_alerts_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "emergency_alerts" ADD CONSTRAINT "emergency_alerts_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "security_incidents" ADD CONSTRAINT "security_incidents_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "security_incidents" ADD CONSTRAINT "security_incidents_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "devices" ADD CONSTRAINT "devices_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "devices" ADD CONSTRAINT "devices_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "health_records_institution_idx" ON "health_records" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "health_records_institution_campus_idx" ON "health_records" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "health_records_status_idx" ON "health_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "medical_incidents_institution_idx" ON "medical_incidents" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "medical_incidents_institution_campus_idx" ON "medical_incidents" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "medical_incidents_status_idx" ON "medical_incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "medication_logs_institution_idx" ON "medication_logs" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "medication_logs_institution_campus_idx" ON "medication_logs" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "medication_logs_status_idx" ON "medication_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "counseling_cases_institution_idx" ON "counseling_cases" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "counseling_cases_institution_campus_idx" ON "counseling_cases" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "counseling_cases_status_idx" ON "counseling_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "counseling_records_institution_idx" ON "counseling_records" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "counseling_records_institution_campus_idx" ON "counseling_records" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "counseling_records_status_idx" ON "counseling_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lab_assets_institution_idx" ON "lab_assets" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lab_assets_institution_campus_idx" ON "lab_assets" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lab_assets_status_idx" ON "lab_assets" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lab_incidents_institution_idx" ON "lab_incidents" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lab_incidents_institution_campus_idx" ON "lab_incidents" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lab_incidents_status_idx" ON "lab_incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lab_schedules_institution_idx" ON "lab_schedules" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lab_schedules_institution_campus_idx" ON "lab_schedules" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lab_schedules_status_idx" ON "lab_schedules" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_institution_idx" ON "appointments" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_institution_campus_idx" ON "appointments" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_status_idx" ON "appointments" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visitors_institution_idx" ON "visitors" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visitors_institution_campus_idx" ON "visitors" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visitors_status_idx" ON "visitors" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "facilities_institution_idx" ON "facilities" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "facilities_institution_campus_idx" ON "facilities" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "facilities_status_idx" ON "facilities" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "facility_assets_institution_idx" ON "facility_assets" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "facility_assets_institution_campus_idx" ON "facility_assets" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "facility_assets_status_idx" ON "facility_assets" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintenance_tasks_institution_idx" ON "maintenance_tasks" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintenance_tasks_institution_campus_idx" ON "maintenance_tasks" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintenance_tasks_status_idx" ON "maintenance_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_orders_institution_idx" ON "work_orders" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_orders_institution_campus_idx" ON "work_orders" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_orders_status_idx" ON "work_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campus_access_logs_institution_idx" ON "campus_access_logs" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campus_access_logs_institution_campus_idx" ON "campus_access_logs" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campus_access_logs_status_idx" ON "campus_access_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emergency_alerts_institution_idx" ON "emergency_alerts" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emergency_alerts_institution_campus_idx" ON "emergency_alerts" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emergency_alerts_status_idx" ON "emergency_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_passes_institution_idx" ON "gate_passes" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_passes_institution_campus_idx" ON "gate_passes" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_passes_status_idx" ON "gate_passes" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_incidents_institution_idx" ON "security_incidents" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_incidents_institution_campus_idx" ON "security_incidents" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_incidents_status_idx" ON "security_incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "access_requests_institution_idx" ON "access_requests" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "access_requests_institution_campus_idx" ON "access_requests" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "access_requests_status_idx" ON "access_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "devices_institution_idx" ON "devices" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "devices_institution_campus_idx" ON "devices" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "devices_status_idx" ON "devices" USING btree ("status");