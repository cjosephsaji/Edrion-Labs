-- Curriculum layer: which subject is taught in which semester of which programme year.
-- Keyed on an abstract semester slot (semester_sequence) so the curriculum is a reusable template
-- that applies to every intake, rather than being tied to one dated academic_terms row.
CREATE TABLE IF NOT EXISTS "programme_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"department_id" uuid NOT NULL,
	"programme_level_id" uuid NOT NULL,
	"semester_sequence" integer DEFAULT 1 NOT NULL,
	"subject_id" uuid NOT NULL,
	"credits" integer,
	"is_elective" boolean DEFAULT false NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "programme_subjects" ADD CONSTRAINT "programme_subjects_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "programme_subjects" ADD CONSTRAINT "programme_subjects_campus_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "programme_subjects" ADD CONSTRAINT "programme_subjects_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "programme_subjects" ADD CONSTRAINT "programme_subjects_programme_level_id_fk" FOREIGN KEY ("programme_level_id") REFERENCES "public"."department_grade_levels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "programme_subjects" ADD CONSTRAINT "programme_subjects_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "programme_subjects_slot_uniq" ON "programme_subjects" ("programme_level_id","semester_sequence","subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "programme_subjects_institution_idx" ON "programme_subjects" ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "programme_subjects_institution_campus_idx" ON "programme_subjects" ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "programme_subjects_level_idx" ON "programme_subjects" ("programme_level_id","semester_sequence");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "programme_subjects_subject_idx" ON "programme_subjects" ("subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "programme_subjects_department_idx" ON "programme_subjects" ("department_id");
