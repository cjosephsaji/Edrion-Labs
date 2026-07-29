-- Mock Exams extensions (PLAN-MOCK-EXAMS Phase D1).
-- Additive only: extend exam_blueprints, mock_exams*, question_bank.
-- Migration number is 0100 because 0098/0099 are Documents / mark_release_batches.
-- exam_profile_key is a validated nullable slug (no FK — exam_profiles Tier 3 table absent).

-- ── exam_blueprints ───────────────────────────────────────────────────────────
ALTER TABLE "exam_blueprints"
  ADD COLUMN IF NOT EXISTS "skin" text NOT NULL DEFAULT 'standard';
ALTER TABLE "exam_blueprints"
  ADD COLUMN IF NOT EXISTS "grading_style" text NOT NULL DEFAULT 'auto';
ALTER TABLE "exam_blueprints"
  ADD COLUMN IF NOT EXISTS "exam_profile_key" text;
ALTER TABLE "exam_blueprints"
  ADD COLUMN IF NOT EXISTS "is_published" boolean NOT NULL DEFAULT false;
ALTER TABLE "exam_blueprints"
  ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;

ALTER TABLE "exam_blueprints" DROP CONSTRAINT IF EXISTS "exam_blueprints_skin_ck";
ALTER TABLE "exam_blueprints"
  ADD CONSTRAINT "exam_blueprints_skin_ck"
  CHECK ("skin" IN ('standard', 'nta', 'paper'));

ALTER TABLE "exam_blueprints" DROP CONSTRAINT IF EXISTS "exam_blueprints_grading_style_ck";
ALTER TABLE "exam_blueprints"
  ADD CONSTRAINT "exam_blueprints_grading_style_ck"
  CHECK ("grading_style" IN ('auto', 'ai_assisted', 'self_graded'));

-- Owner XOR: institution-only | student(+optional institution) | independent
ALTER TABLE "exam_blueprints" DROP CONSTRAINT IF EXISTS "exam_blueprints_owner_ck";
ALTER TABLE "exam_blueprints"
  ADD CONSTRAINT "exam_blueprints_owner_ck" CHECK (
    (
      "institution_id" IS NOT NULL
      AND "student_id" IS NULL
      AND "independent_user_id" IS NULL
    )
    OR (
      "student_id" IS NOT NULL
      AND "independent_user_id" IS NULL
    )
    OR (
      "independent_user_id" IS NOT NULL
      AND "student_id" IS NULL
      AND "institution_id" IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS "exam_blueprints_institution_pub_idx"
  ON "exam_blueprints" ("institution_id", "is_published")
  WHERE "institution_id" IS NOT NULL AND "archived_at" IS NULL;
CREATE INDEX IF NOT EXISTS "exam_blueprints_profile_key_idx"
  ON "exam_blueprints" ("exam_profile_key")
  WHERE "exam_profile_key" IS NOT NULL;

-- Backfill: infer grading_style from section question types; publish institution rows that already exist.
UPDATE "exam_blueprints" eb
SET
  "grading_style" = CASE
    WHEN EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(eb."blueprint"->'sections', '[]'::jsonb)) sec,
           jsonb_array_elements_text(COALESCE(sec->'questionTypes', '[]'::jsonb)) qt
      WHERE qt IN ('short_answer', 'long_answer', 'case_based')
    ) THEN 'ai_assisted'
    ELSE COALESCE(eb."grading_style", 'auto')
  END,
  "is_published" = CASE
    WHEN eb."institution_id" IS NOT NULL AND eb."student_id" IS NULL AND eb."independent_user_id" IS NULL
      THEN true
    ELSE eb."is_published"
  END,
  "skin" = COALESCE(eb."skin", 'standard');

-- ── mock_exams ────────────────────────────────────────────────────────────────
ALTER TABLE "mock_exams"
  ADD COLUMN IF NOT EXISTS "scope" jsonb;
ALTER TABLE "mock_exams"
  ADD COLUMN IF NOT EXISTS "difficulty" text;
ALTER TABLE "mock_exams"
  ADD COLUMN IF NOT EXISTS "scheduled_for" timestamp with time zone;
ALTER TABLE "mock_exams"
  ADD COLUMN IF NOT EXISTS "strict_mode" boolean NOT NULL DEFAULT false;
ALTER TABLE "mock_exams"
  ADD COLUMN IF NOT EXISTS "blueprint_snapshot" jsonb;
ALTER TABLE "mock_exams"
  ADD COLUMN IF NOT EXISTS "blueprint_version" integer;
ALTER TABLE "mock_exams"
  ADD COLUMN IF NOT EXISTS "generation_meta" jsonb;
ALTER TABLE "mock_exams"
  ADD COLUMN IF NOT EXISTS "obligation_id" uuid;

CREATE INDEX IF NOT EXISTS "mock_exams_scheduled_idx"
  ON "mock_exams" ("scheduled_for")
  WHERE "scheduled_for" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "mock_exams_status_idx"
  ON "mock_exams" ("status", "created_at");

-- Status vocabulary extended; legacy values (completed, failed, grading, graded, paused) remain readable.
-- No CHECK that would invalidate old rows.

-- ── mock_exam_questions ───────────────────────────────────────────────────────
ALTER TABLE "mock_exam_questions"
  ADD COLUMN IF NOT EXISTS "source" text;
ALTER TABLE "mock_exam_questions"
  ADD COLUMN IF NOT EXISTS "validator_meta" jsonb;
ALTER TABLE "mock_exam_questions"
  ADD COLUMN IF NOT EXISTS "snapshot_hash" text;

ALTER TABLE "mock_exam_questions" DROP CONSTRAINT IF EXISTS "mock_exam_questions_source_ck";
ALTER TABLE "mock_exam_questions"
  ADD CONSTRAINT "mock_exam_questions_source_ck"
  CHECK ("source" IS NULL OR "source" IN ('bank', 'ai'));

CREATE INDEX IF NOT EXISTS "mock_exam_questions_bank_idx"
  ON "mock_exam_questions" ("question_bank_id")
  WHERE "question_bank_id" IS NOT NULL;

-- ── mock_exam_attempts ────────────────────────────────────────────────────────
ALTER TABLE "mock_exam_attempts"
  ADD COLUMN IF NOT EXISTS "submitted_at" timestamp with time zone;
ALTER TABLE "mock_exam_attempts"
  ADD COLUMN IF NOT EXISTS "tab_switches" integer NOT NULL DEFAULT 0;
ALTER TABLE "mock_exam_attempts"
  ADD COLUMN IF NOT EXISTS "strict_mode_snapshot" boolean;
ALTER TABLE "mock_exam_attempts"
  ADD COLUMN IF NOT EXISTS "current_section_id" text;
ALTER TABLE "mock_exam_attempts"
  ADD COLUMN IF NOT EXISTS "section_deadlines" jsonb;
ALTER TABLE "mock_exam_attempts"
  ADD COLUMN IF NOT EXISTS "scoring_version" text;

-- Backfill submitted_at from finished_at where present.
UPDATE "mock_exam_attempts"
SET "submitted_at" = "finished_at"
WHERE "submitted_at" IS NULL AND "finished_at" IS NOT NULL;

-- ── mock_exam_answers ─────────────────────────────────────────────────────────
ALTER TABLE "mock_exam_answers"
  ADD COLUMN IF NOT EXISTS "state" text NOT NULL DEFAULT 'unseen';
ALTER TABLE "mock_exam_answers"
  ADD COLUMN IF NOT EXISTS "time_spent_ms" integer NOT NULL DEFAULT 0;
ALTER TABLE "mock_exam_answers"
  ADD COLUMN IF NOT EXISTS "answer_mode" text;
ALTER TABLE "mock_exam_answers"
  ADD COLUMN IF NOT EXISTS "photo_refs" jsonb;
ALTER TABLE "mock_exam_answers"
  ADD COLUMN IF NOT EXISTS "answer_schema_version" integer NOT NULL DEFAULT 1;
ALTER TABLE "mock_exam_answers"
  ADD COLUMN IF NOT EXISTS "evaluation_schema_version" integer;

ALTER TABLE "mock_exam_answers" DROP CONSTRAINT IF EXISTS "mock_exam_answers_state_ck";
ALTER TABLE "mock_exam_answers"
  ADD CONSTRAINT "mock_exam_answers_state_ck"
  CHECK ("state" IN ('unseen', 'seen', 'answered', 'marked', 'marked_answered'));

ALTER TABLE "mock_exam_answers" DROP CONSTRAINT IF EXISTS "mock_exam_answers_mode_ck";
ALTER TABLE "mock_exam_answers"
  ADD CONSTRAINT "mock_exam_answers_mode_ck"
  CHECK ("answer_mode" IS NULL OR "answer_mode" IN ('type', 'photo', 'on_paper'));

-- ── question_bank ─────────────────────────────────────────────────────────────
ALTER TABLE "question_bank"
  ADD COLUMN IF NOT EXISTS "institution_id" uuid;
ALTER TABLE "question_bank"
  ADD COLUMN IF NOT EXISTS "subject_id" uuid;
ALTER TABLE "question_bank"
  ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'system';
ALTER TABLE "question_bank"
  ADD COLUMN IF NOT EXISTS "review_status" text NOT NULL DEFAULT 'approved';
ALTER TABLE "question_bank"
  ADD COLUMN IF NOT EXISTS "topic_tags" text[] NOT NULL DEFAULT '{}';
ALTER TABLE "question_bank"
  ADD COLUMN IF NOT EXISTS "difficulty_declared" text;
ALTER TABLE "question_bank"
  ADD COLUMN IF NOT EXISTS "duplicate_of_id" uuid;
ALTER TABLE "question_bank"
  ADD COLUMN IF NOT EXISTS "review_note" text;
ALTER TABLE "question_bank"
  ADD COLUMN IF NOT EXISTS "created_by_staff_id" uuid;
ALTER TABLE "question_bank"
  ADD COLUMN IF NOT EXISTS "reviewed_by_staff_id" uuid;
ALTER TABLE "question_bank"
  ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;
ALTER TABLE "question_bank"
  ADD COLUMN IF NOT EXISTS "bank_version" integer NOT NULL DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE "question_bank"
    ADD CONSTRAINT "question_bank_institution_id_fk"
    FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "question_bank"
    ADD CONSTRAINT "question_bank_duplicate_of_fk"
    FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."question_bank"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "question_bank" DROP CONSTRAINT IF EXISTS "question_bank_source_ck";
ALTER TABLE "question_bank"
  ADD CONSTRAINT "question_bank_source_ck"
  CHECK ("source" IN ('manual', 'import', 'ai', 'system'));

ALTER TABLE "question_bank" DROP CONSTRAINT IF EXISTS "question_bank_review_status_ck";
ALTER TABLE "question_bank"
  ADD CONSTRAINT "question_bank_review_status_ck"
  CHECK ("review_status" IN ('pending', 'approved', 'rejected'));

-- Backfill: existing successfully used / validated rows → approved + system/legacy.
UPDATE "question_bank" qb
SET
  "source" = COALESCE(NULLIF(qb."source", ''), 'system'),
  "review_status" = 'approved',
  "difficulty_declared" = COALESCE(qb."difficulty_declared", qb."difficulty"),
  "reviewed_at" = COALESCE(qb."reviewed_at", qb."created_at")
WHERE qb."review_status" IS NULL
   OR qb."review_status" = 'approved'
   OR qb."source" = 'system';

-- Ensure any pre-extension rows (defaults already approved/system) stay selectable.
UPDATE "question_bank"
SET
  "source" = 'system',
  "review_status" = 'approved',
  "difficulty_declared" = COALESCE("difficulty_declared", "difficulty")
WHERE "created_at" < now();

CREATE INDEX IF NOT EXISTS "question_bank_institution_review_idx"
  ON "question_bank" ("institution_id", "review_status", "qtype", "difficulty")
  WHERE "review_status" = 'approved';
CREATE INDEX IF NOT EXISTS "question_bank_topic_tags_gin"
  ON "question_bank" USING gin ("topic_tags");
CREATE INDEX IF NOT EXISTS "question_bank_subject_idx"
  ON "question_bank" ("subject_id", "review_status")
  WHERE "subject_id" IS NOT NULL;

-- ── institution_settings seed for lab_mocks privacy (Part A §5) ────────────────
-- Uses existing institution_settings plumbing; category/key convention.
-- Defaults are applied at read time when absent; no mass-insert required.
