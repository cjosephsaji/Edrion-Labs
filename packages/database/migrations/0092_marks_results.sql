-- Marks & Results Phase 1: grading schemes, weight maps, release batches, denormalized results, revisions.

ALTER TABLE "academic_terms"
  ADD COLUMN IF NOT EXISTS "grading_scheme_id" uuid,
  ADD COLUMN IF NOT EXISTS "grading_scheme_version" integer;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "grading_schemes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "name" text NOT NULL,
  "kind" text NOT NULL,
  "bands" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "gpa_formula" text DEFAULT 'credit_weighted' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "grading_schemes_kind_check"
    CHECK ("kind" IN ('points_10', 'cbse', 'us_4', 'percentage')),
  CONSTRAINT "grading_schemes_gpa_formula_check"
    CHECK ("gpa_formula" IN ('credit_weighted', 'simple_average', 'none'))
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "grading_scheme_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "scheme_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "subject_weight_maps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "subject_id" uuid NOT NULL,
  "class_id" uuid,
  "term_id" uuid NOT NULL,
  "credits_override" numeric(4, 1),
  "components" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "version" integer DEFAULT 0 NOT NULL,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mark_release_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "campus_id" uuid NOT NULL,
  "term_id" uuid NOT NULL,
  "subject_id" uuid NOT NULL,
  "scope" jsonb NOT NULL,
  "scope_hash" text GENERATED ALWAYS AS (md5("scope"::text)) STORED,
  "status" text DEFAULT 'draft' NOT NULL,
  "entry_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "released_by" uuid,
  "released_at" timestamp with time zone,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "retracted_by" uuid,
  "retracted_at" timestamp with time zone,
  "retract_note" text,
  "missing_entry_count" integer DEFAULT 0 NOT NULL,
  "version" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mark_release_batches_status_check"
    CHECK ("status" IN ('draft', 'pending_approval', 'released', 'retracted'))
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "student_term_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "term_id" uuid NOT NULL,
  "scheme_id" uuid NOT NULL,
  "scheme_version" integer NOT NULL,
  "subjects" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "term_gpa" numeric(4, 2),
  "term_pct" numeric(5, 2) NOT NULL,
  "credits_earned" integer DEFAULT 0 NOT NULL,
  "credits_total" integer DEFAULT 0 NOT NULL,
  "is_complete" boolean DEFAULT false NOT NULL,
  "computed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "student_cgpa_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "as_of_term_id" uuid NOT NULL,
  "cgpa" numeric(4, 2) NOT NULL,
  "terms_included" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mark_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "grade_entry_id" uuid NOT NULL,
  "old_score" integer NOT NULL,
  "new_score" integer NOT NULL,
  "reason_kind" text NOT NULL,
  "note" text NOT NULL,
  "request_id" uuid,
  "revised_by" uuid,
  "revised_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mark_revisions_reason_kind_check"
    CHECK ("reason_kind" IN ('revaluation', 'correction'))
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "academic_terms"
    ADD CONSTRAINT "academic_terms_grading_scheme_id_grading_schemes_id_fk"
    FOREIGN KEY ("grading_scheme_id") REFERENCES "public"."grading_schemes"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "grading_schemes"
    ADD CONSTRAINT "grading_schemes_institution_id_institutions_id_fk"
    FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "grading_scheme_versions"
    ADD CONSTRAINT "grading_scheme_versions_institution_id_institutions_id_fk"
    FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "grading_scheme_versions"
    ADD CONSTRAINT "grading_scheme_versions_scheme_id_grading_schemes_id_fk"
    FOREIGN KEY ("scheme_id") REFERENCES "public"."grading_schemes"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "subject_weight_maps"
    ADD CONSTRAINT "subject_weight_maps_institution_id_institutions_id_fk"
    FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "subject_weight_maps"
    ADD CONSTRAINT "subject_weight_maps_subject_id_subjects_id_fk"
    FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "subject_weight_maps"
    ADD CONSTRAINT "subject_weight_maps_class_id_classes_id_fk"
    FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "subject_weight_maps"
    ADD CONSTRAINT "subject_weight_maps_term_id_academic_terms_id_fk"
    FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "mark_release_batches"
    ADD CONSTRAINT "mark_release_batches_institution_id_institutions_id_fk"
    FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "mark_release_batches"
    ADD CONSTRAINT "mark_release_batches_campus_id_campuses_id_fk"
    FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id")
    ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "mark_release_batches"
    ADD CONSTRAINT "mark_release_batches_term_id_academic_terms_id_fk"
    FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "mark_release_batches"
    ADD CONSTRAINT "mark_release_batches_subject_id_subjects_id_fk"
    FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "student_term_results"
    ADD CONSTRAINT "student_term_results_institution_id_institutions_id_fk"
    FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "student_term_results"
    ADD CONSTRAINT "student_term_results_student_id_students_id_fk"
    FOREIGN KEY ("student_id") REFERENCES "public"."students"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "student_term_results"
    ADD CONSTRAINT "student_term_results_term_id_academic_terms_id_fk"
    FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "student_term_results"
    ADD CONSTRAINT "student_term_results_scheme_id_grading_schemes_id_fk"
    FOREIGN KEY ("scheme_id") REFERENCES "public"."grading_schemes"("id")
    ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "student_cgpa_snapshots"
    ADD CONSTRAINT "student_cgpa_snapshots_institution_id_institutions_id_fk"
    FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "student_cgpa_snapshots"
    ADD CONSTRAINT "student_cgpa_snapshots_student_id_students_id_fk"
    FOREIGN KEY ("student_id") REFERENCES "public"."students"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "student_cgpa_snapshots"
    ADD CONSTRAINT "student_cgpa_snapshots_as_of_term_id_academic_terms_id_fk"
    FOREIGN KEY ("as_of_term_id") REFERENCES "public"."academic_terms"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "mark_revisions"
    ADD CONSTRAINT "mark_revisions_institution_id_institutions_id_fk"
    FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "mark_revisions"
    ADD CONSTRAINT "mark_revisions_student_id_students_id_fk"
    FOREIGN KEY ("student_id") REFERENCES "public"."students"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "mark_revisions"
    ADD CONSTRAINT "mark_revisions_grade_entry_id_grade_entries_id_fk"
    FOREIGN KEY ("grade_entry_id") REFERENCES "public"."grade_entries"("id")
    ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "mark_revisions"
    ADD CONSTRAINT "mark_revisions_request_id_student_requests_id_fk"
    FOREIGN KEY ("request_id") REFERENCES "public"."student_requests"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "grading_schemes_institution_default_uniq"
  ON "grading_schemes" ("institution_id")
  WHERE "is_default" = true;
CREATE INDEX IF NOT EXISTS "grading_schemes_institution_idx"
  ON "grading_schemes" ("institution_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "grading_scheme_versions_scheme_version_uniq"
  ON "grading_scheme_versions" ("scheme_id", "version");
CREATE INDEX IF NOT EXISTS "grading_scheme_versions_institution_idx"
  ON "grading_scheme_versions" ("institution_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "subject_weight_maps_subject_term_class_uniq"
  ON "subject_weight_maps" ("subject_id", "term_id", "class_id") NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS "subject_weight_maps_institution_idx"
  ON "subject_weight_maps" ("institution_id");
CREATE INDEX IF NOT EXISTS "subject_weight_maps_term_idx"
  ON "subject_weight_maps" ("term_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "mark_release_batches_active_scope_uniq"
  ON "mark_release_batches" ("subject_id", "term_id", "scope_hash")
  WHERE "status" IN ('draft', 'pending_approval', 'released');
CREATE INDEX IF NOT EXISTS "mark_release_batches_institution_idx"
  ON "mark_release_batches" ("institution_id");
CREATE INDEX IF NOT EXISTS "mark_release_batches_term_subject_idx"
  ON "mark_release_batches" ("term_id", "subject_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "student_term_results_student_term_uniq"
  ON "student_term_results" ("student_id", "term_id");
CREATE INDEX IF NOT EXISTS "student_term_results_institution_term_idx"
  ON "student_term_results" ("institution_id", "term_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "student_cgpa_snapshots_student_term_uniq"
  ON "student_cgpa_snapshots" ("student_id", "as_of_term_id");
CREATE INDEX IF NOT EXISTS "student_cgpa_snapshots_institution_idx"
  ON "student_cgpa_snapshots" ("institution_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "mark_revisions_grade_entry_idx"
  ON "mark_revisions" ("grade_entry_id");
CREATE INDEX IF NOT EXISTS "mark_revisions_student_idx"
  ON "mark_revisions" ("student_id");
CREATE INDEX IF NOT EXISTS "mark_revisions_institution_idx"
  ON "mark_revisions" ("institution_id");
--> statement-breakpoint

INSERT INTO "feature_definitions" (
  "id", "key", "name", "description", "module", "status", "default_value",
  "available_scopes", "created_at", "updated_at"
)
VALUES
  (gen_random_uuid(), 'student.results.whatif', 'Results what-if calculator', 'Client-side grade estimator on marks screen', 'student-portal', 'active', true, '["institution","campus","institution_user"]'::jsonb, now(), now()),
  (gen_random_uuid(), 'student.results.petros_fix', 'Petros weak-topic fix', 'Stub hook for Petros Learn remediation', 'student-portal', 'active', false, '["institution","campus","institution_user"]'::jsonb, now(), now())
ON CONFLICT ("key") DO NOTHING;
