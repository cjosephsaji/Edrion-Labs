CREATE TABLE IF NOT EXISTS "fee_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"invoice_no" text NOT NULL,
	"student_id" uuid NOT NULL,
	"fee_structure_id" uuid,
	"amount" integer DEFAULT 0 NOT NULL,
	"amount_paid" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"issue_date" date,
	"due_date" date,
	"notes" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"reference" text,
	"paid_date" date,
	"notes" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_structures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"name" text NOT NULL,
	"fee_type" text DEFAULT 'tuition' NOT NULL,
	"grade_level_id" uuid,
	"class_id" uuid,
	"academic_year_id" uuid,
	"amount" integer DEFAULT 0 NOT NULL,
	"frequency" text DEFAULT 'one_time' NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"payroll_run_id" uuid NOT NULL,
	"employee_type" text DEFAULT 'teacher' NOT NULL,
	"teacher_id" uuid,
	"staff_id" uuid,
	"gross" integer DEFAULT 0 NOT NULL,
	"deductions" integer DEFAULT 0 NOT NULL,
	"net" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"name" text NOT NULL,
	"period_label" text,
	"period_start" date,
	"period_end" date,
	"pay_date" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_fee_structure_id_fee_structures_id_fk" FOREIGN KEY ("fee_structure_id") REFERENCES "public"."fee_structures"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_invoice_id_fee_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."fee_invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_grade_level_id_grade_levels_id_fk" FOREIGN KEY ("grade_level_id") REFERENCES "public"."grade_levels"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_invoices_institution_idx" ON "fee_invoices" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_invoices_institution_campus_idx" ON "fee_invoices" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_invoices_student_idx" ON "fee_invoices" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_invoices_status_idx" ON "fee_invoices" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_invoice_no_uniq" ON "fee_invoices" USING btree ("institution_id","invoice_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_payments_institution_idx" ON "fee_payments" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_payments_invoice_idx" ON "fee_payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_structures_institution_idx" ON "fee_structures" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_structures_institution_campus_idx" ON "fee_structures" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_structures_status_idx" ON "fee_structures" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_items_institution_idx" ON "payroll_items" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_items_run_idx" ON "payroll_items" USING btree ("payroll_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_items_teacher_idx" ON "payroll_items" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_items_staff_idx" ON "payroll_items" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_runs_institution_idx" ON "payroll_runs" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_runs_institution_campus_idx" ON "payroll_runs" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_runs_status_idx" ON "payroll_runs" USING btree ("status");