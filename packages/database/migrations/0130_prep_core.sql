-- Entrance Prep phase 1: exam profile catalog + learner tables.

CREATE TABLE IF NOT EXISTS exam_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  family text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  content_strategy text NOT NULL DEFAULT 'authored_to_framework',
  delivery_profile_key text NOT NULL DEFAULT 'standard',
  version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_profiles_status_ck CHECK (status IN ('draft', 'content_ready', 'active', 'retired'))
);
--> statement-breakpoint

INSERT INTO exam_profiles (key, name, family, status, delivery_profile_key, metadata) VALUES
  ('sat_digital', 'SAT Digital', 'sat', 'content_ready', 'bluebook_v1', '{"priority":1}'),
  ('act_enhanced', 'ACT Enhanced', 'act', 'draft', 'standard', '{"priority":2}'),
  ('jee_main', 'JEE Main (PYQ)', 'jee', 'draft', 'standard', '{"priority":3,"thin":true}'),
  ('neet_ug', 'NEET UG (PYQ)', 'neet', 'draft', 'standard', '{"priority":4,"thin":true}')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS exam_administrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  exam_profile_id uuid NOT NULL REFERENCES exam_profiles(id) ON DELETE CASCADE,
  label text NOT NULL,
  test_date date,
  registration_deadline date,
  verified_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS prep_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  exam_profile_id uuid NOT NULL REFERENCES exam_profiles(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prep_enrollments_subject_ck CHECK (
    (student_id IS NOT NULL AND independent_user_id IS NULL)
    OR (student_id IS NULL AND independent_user_id IS NOT NULL)
  ),
  CONSTRAINT prep_enrollments_status_ck CHECK (status IN ('active', 'paused', 'completed', 'withdrawn'))
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS prep_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  enrollment_id uuid NOT NULL REFERENCES prep_enrollments(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  status text NOT NULL DEFAULT 'active',
  generator_version text NOT NULL DEFAULT '1.0.0',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS prep_plan_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  plan_id uuid NOT NULL REFERENCES prep_plans(id) ON DELETE CASCADE,
  block_date date NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  obligation_synced boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prep_plan_blocks_kind_ck CHECK (kind IN ('study_block', 'mock', 'review', 'diagnostic'))
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS prep_error_notebook_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  source_kind text NOT NULL,
  attempt_id uuid,
  question_id uuid,
  tags jsonb NOT NULL DEFAULT '[]',
  note text,
  resolution text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prep_error_notebook_entries_subject_ck CHECK (
    (student_id IS NOT NULL AND independent_user_id IS NULL)
    OR (student_id IS NULL AND independent_user_id IS NOT NULL)
  )
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS prep_diagnostic_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  enrollment_id uuid NOT NULL REFERENCES prep_enrollments(id) ON DELETE CASCADE,
  mock_attempt_id uuid,
  status text NOT NULL DEFAULT 'pending',
  summary jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS prep_readiness_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  enrollment_id uuid NOT NULL REFERENCES prep_enrollments(id) ON DELETE CASCADE,
  as_of date NOT NULL,
  band_label text,
  metrics jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
