-- Academic terms (periods within an academic year) + optional term_id FKs on exams, fees, timetable.
CREATE TABLE IF NOT EXISTS "academic_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"academic_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'term' NOT NULL,
	"sequence" integer DEFAULT 1 NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'planning' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_campus_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "academic_terms_institution_idx" ON "academic_terms" ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "academic_terms_institution_campus_idx" ON "academic_terms" ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "academic_terms_year_idx" ON "academic_terms" ("academic_year_id");--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "term_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exams" ADD CONSTRAINT "exams_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "term_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD COLUMN IF NOT EXISTS "term_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
