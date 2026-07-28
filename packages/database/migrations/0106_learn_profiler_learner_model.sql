-- 0106_learn_profiler_learner_model
-- Phase E: DEC-14 ad-hoc null topic FK on sessions; durable learner model
-- state (pace preference + per-move outcome stats). Idempotent.

-- ── 1. Ad-hoc sessions may have no learn_topics row (DEC-14 / AC3) ───────────
ALTER TABLE learn_sessions ALTER COLUMN topic_id DROP NOT NULL;

-- ── 2. learner_model_state — pace + aggregated move outcomes ────────────────
-- User-owned (DEC-1 owner XOR). One row per learner. Written lazily on first
-- observe signal or session close rollup; never expires.
CREATE TABLE IF NOT EXISTS learner_model_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  -- 'slow' | 'normal' | 'fast'; null until observed
  pace_preference text,
  -- {[move_type]: {correct, wrong, null_count, escaped, expanded_deeper, skipped, count}}
  move_outcome_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Rolling short-dwell count toward the pace trigger (ephemeral observe state).
  short_dwell_streak integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learner_model_state_owner_ck CHECK (
    (student_id IS NOT NULL)::int + (independent_user_id IS NOT NULL)::int = 1
  ),
  CONSTRAINT learner_model_state_pace_ck CHECK (
    pace_preference IS NULL OR pace_preference IN ('slow', 'normal', 'fast')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS learner_model_state_student_uq
  ON learner_model_state (student_id)
  WHERE student_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS learner_model_state_independent_uq
  ON learner_model_state (independent_user_id)
  WHERE independent_user_id IS NOT NULL;

ALTER TABLE learner_model_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_model_state FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learner_model_state_owner_private ON learner_model_state;
CREATE POLICY learner_model_state_owner_private ON learner_model_state
  FOR ALL
  USING (
    (
      edrion_current_institution() IS NOT NULL
      AND institution_id::text = edrion_current_institution()
      AND student_id IS NOT NULL
    )
    OR (
      edrion_current_independent_user() IS NOT NULL
      AND independent_user_id::text = edrion_current_independent_user()
    )
    OR (
      edrion_current_institution() IS NULL
      AND edrion_current_independent_user() IS NULL
    )
  );
