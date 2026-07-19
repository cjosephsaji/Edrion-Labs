-- Named bell schedules: period types + schedules + periods, linked to classes / timetable / attendance.

CREATE TABLE IF NOT EXISTS "bell_period_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"layout" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bell_period_types" ADD CONSTRAINT "bell_period_types_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bell_period_types_institution_key_uniq" ON "bell_period_types" ("institution_id","key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bell_period_types_institution_idx" ON "bell_period_types" ("institution_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bell_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"name" text NOT NULL,
	"days_of_week" smallint[] NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bell_schedules" ADD CONSTRAINT "bell_schedules_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bell_schedules" ADD CONSTRAINT "bell_schedules_campus_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bell_schedules_institution_name_uniq" ON "bell_schedules" ("institution_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bell_schedules_institution_idx" ON "bell_schedules" ("institution_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bell_schedules_institution_campus_idx" ON "bell_schedules" ("institution_id","campus_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bell_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"period_type_id" uuid NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"label" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bell_periods" ADD CONSTRAINT "bell_periods_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bell_periods" ADD CONSTRAINT "bell_periods_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."bell_schedules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bell_periods" ADD CONSTRAINT "bell_periods_period_type_id_fk" FOREIGN KEY ("period_type_id") REFERENCES "public"."bell_period_types"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bell_periods_schedule_start_uniq" ON "bell_periods" ("schedule_id","start_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bell_periods_schedule_start_idx" ON "bell_periods" ("schedule_id","start_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bell_periods_institution_idx" ON "bell_periods" ("institution_id");
--> statement-breakpoint

ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "bell_schedule_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "classes" ADD CONSTRAINT "classes_bell_schedule_id_fk" FOREIGN KEY ("bell_schedule_id") REFERENCES "public"."bell_schedules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "classes_bell_schedule_idx" ON "classes" ("bell_schedule_id");
--> statement-breakpoint

ALTER TABLE "timetable_slots" ADD COLUMN IF NOT EXISTS "period_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."bell_periods"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "timetable_slots_period_idx" ON "timetable_slots" ("period_id");
--> statement-breakpoint

ALTER TABLE "attendance_sessions" ADD COLUMN IF NOT EXISTS "period_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."bell_periods"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_sessions_period_idx" ON "attendance_sessions" ("period_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_session_period_id_uniq"
  ON "attendance_sessions" ("class_id","date","period_id")
  WHERE "period_id" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "staff_institution_user_idx" ON "staff" ("institution_user_id") WHERE "institution_user_id" IS NOT NULL;
