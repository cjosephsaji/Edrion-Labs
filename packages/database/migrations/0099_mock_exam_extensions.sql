-- Tier 2 Mock D1: blueprint/mock/bank extensions and exam_profile_key seam.

ALTER TABLE exam_blueprints
  ADD COLUMN IF NOT EXISTS skin text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS grading_style text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE exam_blueprints ADD CONSTRAINT exam_blueprints_skin_ck CHECK (
    skin IN ('standard', 'nta', 'paper')
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE exam_blueprints ADD CONSTRAINT exam_blueprints_grading_style_ck CHECK (
    grading_style IN ('auto', 'ai_assisted', 'self_graded')
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

ALTER TABLE mock_exams
  ADD COLUMN IF NOT EXISTS exam_profile_key text,
  ADD COLUMN IF NOT EXISTS scope jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS difficulty text,
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS strict_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blueprint_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS blueprint_version integer,
  ADD COLUMN IF NOT EXISTS generation_meta jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS obligation_id uuid;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS mock_exams_exam_profile_key_idx
  ON mock_exams (exam_profile_key)
  WHERE exam_profile_key IS NOT NULL;
--> statement-breakpoint

ALTER TABLE mock_exam_questions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS snapshot_hash text;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE mock_exam_questions ADD CONSTRAINT mock_exam_questions_source_ck CHECK (
    source IN ('bank', 'ai')
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

ALTER TABLE mock_exam_attempts
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS tab_switches integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strict_mode_snapshot boolean,
  ADD COLUMN IF NOT EXISTS current_section_id text,
  ADD COLUMN IF NOT EXISTS section_deadlines jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scoring_version text;
--> statement-breakpoint

ALTER TABLE mock_exam_answers
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'unseen',
  ADD COLUMN IF NOT EXISTS time_spent_ms integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS answer_mode text NOT NULL DEFAULT 'type',
  ADD COLUMN IF NOT EXISTS photo_refs jsonb NOT NULL DEFAULT '[]';
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE mock_exam_answers ADD CONSTRAINT mock_exam_answers_state_ck CHECK (
    state IN ('unseen', 'seen', 'answered', 'marked', 'marked_answered')
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE mock_exam_answers ADD CONSTRAINT mock_exam_answers_answer_mode_ck CHECK (
    answer_mode IN ('type', 'photo', 'on_paper')
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

ALTER TABLE question_bank
  ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS subject_id uuid,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS topic_tags text[] NOT NULL DEFAULT '{}';
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE question_bank ADD CONSTRAINT question_bank_source_ck CHECK (
    source IN ('manual', 'import', 'ai', 'system', 'legacy')
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE question_bank ADD CONSTRAINT question_bank_review_status_ck CHECK (
    review_status IN ('pending', 'approved', 'rejected')
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
