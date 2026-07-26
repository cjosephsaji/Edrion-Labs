CREATE TABLE IF NOT EXISTS "parents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"occupation" text,
	"address" text,
	"institution_user_id" uuid,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"employee_no" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"department_id" uuid,
	"designation" text,
	"employment_type" text DEFAULT 'full_time' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"join_date" date,
	"institution_user_id" uuid,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"parent_id" uuid NOT NULL,
	"relationship" text DEFAULT 'guardian' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_emergency_contact" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"admission_no" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"gender" text,
	"date_of_birth" date,
	"email" text,
	"phone" text,
	"grade_level_id" uuid,
	"class_id" uuid,
	"roll_no" text,
	"address" text,
	"status" text DEFAULT 'enrolled' NOT NULL,
	"enrollment_date" date,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"employee_no" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"department_id" uuid,
	"designation" text,
	"employment_type" text DEFAULT 'full_time' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"join_date" date,
	"institution_user_id" uuid,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_subject_teachers" DROP CONSTRAINT "class_subject_teachers_teacher_id_institution_users_id_fk";
--> statement-breakpoint
ALTER TABLE "classes" DROP CONSTRAINT "classes_class_teacher_id_institution_users_id_fk";
--> statement-breakpoint
ALTER TABLE "departments" DROP CONSTRAINT "departments_head_user_id_institution_users_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "parents" ADD CONSTRAINT "parents_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "parents" ADD CONSTRAINT "parents_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "parents" ADD CONSTRAINT "parents_institution_user_id_institution_users_id_fk" FOREIGN KEY ("institution_user_id") REFERENCES "public"."institution_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff" ADD CONSTRAINT "staff_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff" ADD CONSTRAINT "staff_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff" ADD CONSTRAINT "staff_institution_user_id_institution_users_id_fk" FOREIGN KEY ("institution_user_id") REFERENCES "public"."institution_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_parent_id_parents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "students" ADD CONSTRAINT "students_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "students" ADD CONSTRAINT "students_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teachers" ADD CONSTRAINT "teachers_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teachers" ADD CONSTRAINT "teachers_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teachers" ADD CONSTRAINT "teachers_institution_user_id_institution_users_id_fk" FOREIGN KEY ("institution_user_id") REFERENCES "public"."institution_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parents_institution_idx" ON "parents" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parents_institution_campus_idx" ON "parents" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_institution_idx" ON "staff" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_institution_campus_idx" ON "staff" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_department_idx" ON "staff" USING btree ("department_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "staff_employee_uniq" ON "staff" USING btree ("institution_id","employee_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_guardians_institution_idx" ON "student_guardians" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_guardians_student_idx" ON "student_guardians" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_guardians_parent_idx" ON "student_guardians" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_guardian_uniq" ON "student_guardians" USING btree ("student_id","parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_institution_idx" ON "students" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_institution_campus_idx" ON "students" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_class_idx" ON "students" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "students_admission_uniq" ON "students" USING btree ("institution_id","admission_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teachers_institution_idx" ON "teachers" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teachers_institution_campus_idx" ON "teachers" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teachers_department_idx" ON "teachers" USING btree ("department_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teachers_employee_uniq" ON "teachers" USING btree ("institution_id","employee_no");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "class_subject_teachers" ADD CONSTRAINT "class_subject_teachers_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "classes" ADD CONSTRAINT "classes_class_teacher_id_teachers_id_fk" FOREIGN KEY ("class_teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "departments" ADD CONSTRAINT "departments_head_user_id_teachers_id_fk" FOREIGN KEY ("head_user_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- people→academics FKs: defined as plain uuid columns in schema/people.ts to break the
-- academics↔people Drizzle type cycle; the DB constraints are created here by hand (idempotent).
DO $$ BEGIN
 ALTER TABLE "students" ADD CONSTRAINT "students_grade_level_id_grade_levels_id_fk" FOREIGN KEY ("grade_level_id") REFERENCES "public"."grade_levels"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "students" ADD CONSTRAINT "students_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teachers" ADD CONSTRAINT "teachers_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff" ADD CONSTRAINT "staff_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
