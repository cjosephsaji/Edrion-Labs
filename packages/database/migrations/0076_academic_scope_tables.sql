-- Academic scope: enrollment history tables + year/term stamps on transactional rows.
-- Partial uniques: (person, year) WHERE term_id IS NULL and (person, year, term) WHERE term_id IS NOT NULL.

CREATE TABLE IF NOT EXISTS "student_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"student_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"term_id" uuid,
	"programme_level_id" uuid,
	"grade_level_id" uuid,
	"class_id" uuid,
	"roll_no" text,
	"status" text DEFAULT 'active' NOT NULL,
	"enrolled_on" date,
	"exited_on" date,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_campus_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_programme_level_id_fk" FOREIGN KEY ("programme_level_id") REFERENCES "public"."department_grade_levels"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_grade_level_id_fk" FOREIGN KEY ("grade_level_id") REFERENCES "public"."grade_levels"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_enrollments_year_whole_uniq" ON "student_enrollments" ("student_id","academic_year_id") WHERE "term_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_enrollments_year_term_uniq" ON "student_enrollments" ("student_id","academic_year_id","term_id") WHERE "term_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_enrollments_institution_idx" ON "student_enrollments" ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_enrollments_institution_campus_idx" ON "student_enrollments" ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_enrollments_year_term_student_idx" ON "student_enrollments" ("institution_id","academic_year_id","term_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_enrollments_student_idx" ON "student_enrollments" ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_enrollments_class_idx" ON "student_enrollments" ("class_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "staff_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"staff_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"term_id" uuid,
	"department_id" uuid,
	"designation" text,
	"employment_type" text,
	"status" text DEFAULT 'active' NOT NULL,
	"started_on" date,
	"ended_on" date,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_campus_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "staff_assignments_year_whole_uniq" ON "staff_assignments" ("staff_id","academic_year_id") WHERE "term_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "staff_assignments_year_term_uniq" ON "staff_assignments" ("staff_id","academic_year_id","term_id") WHERE "term_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_assignments_institution_idx" ON "staff_assignments" ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_assignments_institution_campus_idx" ON "staff_assignments" ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_assignments_year_term_staff_idx" ON "staff_assignments" ("institution_id","academic_year_id","term_id","staff_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_assignments_staff_idx" ON "staff_assignments" ("staff_id");
--> statement-breakpoint

ALTER TABLE "grade_entries" ADD COLUMN IF NOT EXISTS "academic_year_id" uuid;--> statement-breakpoint
ALTER TABLE "grade_entries" ADD COLUMN IF NOT EXISTS "term_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grade_entries_year_idx" ON "grade_entries" ("academic_year_id");
--> statement-breakpoint

ALTER TABLE "fee_invoices" ADD COLUMN IF NOT EXISTS "academic_year_id" uuid;--> statement-breakpoint
ALTER TABLE "fee_invoices" ADD COLUMN IF NOT EXISTS "term_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_invoices_year_idx" ON "fee_invoices" ("academic_year_id");
--> statement-breakpoint

ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "academic_year_id" uuid;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "term_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignments" ADD CONSTRAINT "assignments_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignments" ADD CONSTRAINT "assignments_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignments_year_idx" ON "assignments" ("academic_year_id");
--> statement-breakpoint

ALTER TABLE "attendance_sessions" ADD COLUMN IF NOT EXISTS "academic_year_id" uuid;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN IF NOT EXISTS "term_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_sessions_year_idx" ON "attendance_sessions" ("academic_year_id");
--> statement-breakpoint

-- course_enrollments: add tenant columns (was missing institution_id / campus_id — RLS gap).
ALTER TABLE "course_enrollments" ADD COLUMN IF NOT EXISTS "institution_id" uuid;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD COLUMN IF NOT EXISTS "campus_id" uuid;--> statement-breakpoint
UPDATE "course_enrollments" AS ce
SET "institution_id" = c."institution_id",
    "campus_id" = c."campus_id"
FROM "courses" AS c
WHERE ce."course_id" = c."id"
  AND ce."institution_id" IS NULL;--> statement-breakpoint
-- Drop orphans that cannot be attributed to a course/institution.
DELETE FROM "course_enrollments" WHERE "institution_id" IS NULL;--> statement-breakpoint
ALTER TABLE "course_enrollments" ALTER COLUMN "institution_id" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_campus_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "course_enrollments_institution_idx" ON "course_enrollments" ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "course_enrollments_institution_campus_idx" ON "course_enrollments" ("institution_id","campus_id");
