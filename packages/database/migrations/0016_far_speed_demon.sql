CREATE TABLE IF NOT EXISTS "exam_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"exam_date" date,
	"start_time" text,
	"end_time" text,
	"max_marks" integer DEFAULT 100 NOT NULL,
	"pass_marks" integer,
	"room" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"name" text NOT NULL,
	"exam_type" text DEFAULT 'term' NOT NULL,
	"academic_year_id" uuid,
	"term_label" text,
	"start_date" date,
	"end_date" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"description" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grade_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"student_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"exam_id" uuid,
	"class_id" uuid,
	"assessment_name" text NOT NULL,
	"marks_obtained" integer DEFAULT 0 NOT NULL,
	"max_marks" integer DEFAULT 100 NOT NULL,
	"letter_grade" text,
	"remarks" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assignment_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" text DEFAULT 'assigned' NOT NULL,
	"submitted_date" date,
	"points_awarded" integer,
	"feedback" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"title" text NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid,
	"teacher_id" uuid,
	"instructions" text,
	"due_date" date,
	"max_points" integer DEFAULT 100 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exams" ADD CONSTRAINT "exams_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exams" ADD CONSTRAINT "exams_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exams" ADD CONSTRAINT "exams_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignments" ADD CONSTRAINT "assignments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignments" ADD CONSTRAINT "assignments_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignments" ADD CONSTRAINT "assignments_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignments" ADD CONSTRAINT "assignments_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_schedules_institution_idx" ON "exam_schedules" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_schedules_exam_idx" ON "exam_schedules" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_schedules_class_idx" ON "exam_schedules" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exam_schedule_uniq" ON "exam_schedules" USING btree ("exam_id","class_id","subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exams_institution_idx" ON "exams" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exams_institution_campus_idx" ON "exams" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exams_status_idx" ON "exams" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grade_entries_institution_idx" ON "grade_entries" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grade_entries_institution_campus_idx" ON "grade_entries" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grade_entries_student_idx" ON "grade_entries" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grade_entries_exam_idx" ON "grade_entries" USING btree ("exam_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "grade_entry_uniq" ON "grade_entries" USING btree ("student_id","subject_id","exam_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_submissions_institution_idx" ON "assignment_submissions" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_submissions_assignment_idx" ON "assignment_submissions" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_submissions_student_idx" ON "assignment_submissions" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assignment_submission_uniq" ON "assignment_submissions" USING btree ("assignment_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignments_institution_idx" ON "assignments" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignments_institution_campus_idx" ON "assignments" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignments_class_idx" ON "assignments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignments_status_idx" ON "assignments" USING btree ("status");