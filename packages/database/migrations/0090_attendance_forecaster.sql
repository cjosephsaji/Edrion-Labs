-- Attendance Forecaster Phase 1: policy config, rollup cache, deferred marks, record hardening.

ALTER TABLE "attendance_records"
  ADD COLUMN IF NOT EXISTS "provenance" jsonb;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "attendance_records"
    WHERE "status" NOT IN ('present', 'absent', 'late', 'excused', 'left_early', 'od')
  ) THEN
    RAISE EXCEPTION 'attendance_records contains status values outside the permitted set';
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "attendance_records"
  DROP CONSTRAINT IF EXISTS "attendance_records_status_check";
--> statement-breakpoint

ALTER TABLE "attendance_records"
  ADD CONSTRAINT "attendance_records_status_check"
  CHECK ("status" IN ('present', 'absent', 'late', 'excused', 'left_early', 'od'));
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "attendance_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "campus_id" uuid,
  "threshold_pct" numeric NOT NULL DEFAULT 75,
  "safe_margin_pct" numeric NOT NULL DEFAULT 5,
  "od_basis" text NOT NULL DEFAULT 'present',
  "excused_basis" text NOT NULL DEFAULT 'excluded',
  "late_counts_as" text NOT NULL DEFAULT 'present',
  "left_early_counts_as" text NOT NULL DEFAULT 'present',
  "computation_basis" text NOT NULL DEFAULT 'conducted',
  "leave_mark" text NOT NULL DEFAULT 'excused',
  "correction_window_days" integer NOT NULL DEFAULT 14,
  "condonation_enabled" boolean NOT NULL DEFAULT true,
  "parent_visibility" text NOT NULL DEFAULT 'off',
  "working_days_mask" integer NOT NULL DEFAULT 63,
  "version" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "attendance_policies_threshold_pct_check"
    CHECK ("threshold_pct" >= 1 AND "threshold_pct" <= 100),
  CONSTRAINT "attendance_policies_safe_margin_pct_check"
    CHECK ("safe_margin_pct" >= 0 AND "safe_margin_pct" <= 50),
  CONSTRAINT "attendance_policies_od_basis_check"
    CHECK ("od_basis" IN ('present', 'excluded')),
  CONSTRAINT "attendance_policies_excused_basis_check"
    CHECK ("excused_basis" IN ('present', 'excluded')),
  CONSTRAINT "attendance_policies_late_counts_as_check"
    CHECK ("late_counts_as" IN ('present', 'absent')),
  CONSTRAINT "attendance_policies_left_early_counts_as_check"
    CHECK ("left_early_counts_as" IN ('present', 'absent')),
  CONSTRAINT "attendance_policies_computation_basis_check"
    CHECK ("computation_basis" IN ('conducted', 'scheduled')),
  CONSTRAINT "attendance_policies_leave_mark_check"
    CHECK ("leave_mark" IN ('excused', 'od')),
  CONSTRAINT "attendance_policies_parent_visibility_check"
    CHECK ("parent_visibility" IN ('on', 'off'))
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "attendance_rollups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "subject_id" uuid,
  "term_id" uuid NOT NULL,
  "attended" integer NOT NULL DEFAULT 0,
  "conducted" integer NOT NULL DEFAULT 0,
  "remaining" integer NOT NULL DEFAULT 0,
  "pct" numeric,
  "forecast" jsonb NOT NULL DEFAULT '{"branch":"none","n":0}'::jsonb,
  "zone" text NOT NULL DEFAULT 'safe',
  "recovered_toast_pending" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "attendance_rollups_zone_check"
    CHECK ("zone" IN ('safe', 'warning', 'below', 'unrecoverable'))
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "request_marks_pending" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "request_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "class_id" uuid NOT NULL,
  "subject_id" uuid,
  "occurrence_date" date NOT NULL,
  "slot_id" uuid,
  "target_mark" text NOT NULL,
  "applied_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "request_marks_pending_target_mark_check"
    CHECK ("target_mark" IN ('present', 'absent', 'late', 'excused', 'left_early', 'od'))
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "attendance_policies"
    ADD CONSTRAINT "attendance_policies_institution_id_institutions_id_fk"
    FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attendance_policies"
    ADD CONSTRAINT "attendance_policies_campus_id_campuses_id_fk"
    FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attendance_rollups"
    ADD CONSTRAINT "attendance_rollups_institution_id_institutions_id_fk"
    FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attendance_rollups"
    ADD CONSTRAINT "attendance_rollups_student_id_students_id_fk"
    FOREIGN KEY ("student_id") REFERENCES "public"."students"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attendance_rollups"
    ADD CONSTRAINT "attendance_rollups_subject_id_subjects_id_fk"
    FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attendance_rollups"
    ADD CONSTRAINT "attendance_rollups_term_id_academic_terms_id_fk"
    FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "request_marks_pending"
    ADD CONSTRAINT "request_marks_pending_institution_id_institutions_id_fk"
    FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "request_marks_pending"
    ADD CONSTRAINT "request_marks_pending_request_id_student_requests_id_fk"
    FOREIGN KEY ("request_id") REFERENCES "public"."student_requests"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "request_marks_pending"
    ADD CONSTRAINT "request_marks_pending_student_id_students_id_fk"
    FOREIGN KEY ("student_id") REFERENCES "public"."students"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "request_marks_pending"
    ADD CONSTRAINT "request_marks_pending_class_id_classes_id_fk"
    FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "request_marks_pending"
    ADD CONSTRAINT "request_marks_pending_subject_id_subjects_id_fk"
    FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "request_marks_pending"
    ADD CONSTRAINT "request_marks_pending_slot_id_timetable_slots_id_fk"
    FOREIGN KEY ("slot_id") REFERENCES "public"."timetable_slots"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_policies_institution_default_uniq"
  ON "attendance_policies" ("institution_id")
  WHERE "campus_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_policies_institution_campus_uniq"
  ON "attendance_policies" ("institution_id", "campus_id")
  WHERE "campus_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_policies_institution_idx"
  ON "attendance_policies" ("institution_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_rollups_student_subject_term_uniq"
  ON "attendance_rollups" ("student_id", "subject_id", "term_id")
  WHERE "subject_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_rollups_student_overall_term_uniq"
  ON "attendance_rollups" ("student_id", "term_id")
  WHERE "subject_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_rollups_institution_term_idx"
  ON "attendance_rollups" ("institution_id", "term_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "request_marks_pending_idempotent_uniq"
  ON "request_marks_pending" (
    "request_id",
    "student_id",
    "occurrence_date",
    COALESCE("slot_id", '00000000-0000-0000-0000-000000000000'::uuid)
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "request_marks_pending_institution_date_idx"
  ON "request_marks_pending" ("institution_id", "occurrence_date")
  WHERE "applied_at" IS NULL;
--> statement-breakpoint

INSERT INTO "attendance_policies" (
  "institution_id",
  "threshold_pct",
  "safe_margin_pct",
  "od_basis",
  "excused_basis",
  "late_counts_as",
  "left_early_counts_as",
  "computation_basis",
  "leave_mark",
  "correction_window_days",
  "condonation_enabled",
  "parent_visibility",
  "working_days_mask"
)
SELECT
  i."id",
  COALESCE(
    (
      SELECT NULLIF(TRIM(s."value"), '')::numeric
      FROM "institution_settings" s
      WHERE s."institution_id" = i."id"
        AND s."category" = 'student_portal'
        AND s."key" = 'attendance_threshold'
        AND s."campus_id" IS NULL
      ORDER BY s."updated_at" DESC
      LIMIT 1
    ),
    75
  ),
  5,
  'present',
  'excluded',
  'present',
  'present',
  'conducted',
  'excused',
  14,
  true,
  'off',
  63
FROM "institutions" i
ON CONFLICT DO NOTHING;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON attendance_policies, attendance_rollups, request_marks_pending TO edrion_app;
