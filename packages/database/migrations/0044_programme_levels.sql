-- Programme→Year structure layer: department_grade_levels join + optional programme_level_id on terms/classes.
CREATE TABLE IF NOT EXISTS "department_grade_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"department_id" uuid NOT NULL,
	"grade_level_id" uuid NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"duration_label" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "department_grade_levels" ADD CONSTRAINT "department_grade_levels_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "department_grade_levels" ADD CONSTRAINT "department_grade_levels_campus_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "department_grade_levels" ADD CONSTRAINT "department_grade_levels_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "department_grade_levels" ADD CONSTRAINT "department_grade_levels_grade_level_id_fk" FOREIGN KEY ("grade_level_id") REFERENCES "public"."grade_levels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "department_grade_levels_dept_grade_uniq" ON "department_grade_levels" ("department_id","grade_level_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "department_grade_levels_institution_idx" ON "department_grade_levels" ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "department_grade_levels_institution_campus_idx" ON "department_grade_levels" ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "department_grade_levels_department_idx" ON "department_grade_levels" ("department_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "department_grade_levels_grade_idx" ON "department_grade_levels" ("grade_level_id");--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "programme_level_id" uuid;--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "department_id" uuid;--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "grade_level_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_programme_level_id_fk" FOREIGN KEY ("programme_level_id") REFERENCES "public"."department_grade_levels"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_grade_level_id_fk" FOREIGN KEY ("grade_level_id") REFERENCES "public"."grade_levels"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "academic_terms_programme_level_idx" ON "academic_terms" ("programme_level_id");--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "programme_level_id" uuid;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "term_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "classes" ADD CONSTRAINT "classes_programme_level_id_fk" FOREIGN KEY ("programme_level_id") REFERENCES "public"."department_grade_levels"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "classes" ADD CONSTRAINT "classes_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "classes_programme_level_idx" ON "classes" ("programme_level_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "classes_term_idx" ON "classes" ("term_id");
