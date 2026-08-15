-- Petros Stage 3: typed observation, answer evaluation, struggle ladder, and composer detours.

ALTER TABLE petros_learning_sessions
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
ALTER TABLE petros_teaching_blocks
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
ALTER TABLE petros_planning_decisions
  ADD COLUMN IF NOT EXISTS guess_first jsonb NOT NULL DEFAULT '{"status":"not_applicable","targetId":null,"reason":"Created before Stage 3 observation."}'::jsonb,
  ADD COLUMN IF NOT EXISTS observation_response jsonb NOT NULL DEFAULT '{"causalObservationIds":[],"action":"continue","acknowledgement":null,"routeChange":null,"returnPlan":null}'::jsonb;

UPDATE petros_learning_sessions
SET state_version = 'petros.session-state.v2',
    prompt_version = 'stage3-plan-v1',
    output_schema_version = 'petros.plan.v2'
WHERE state_version = 'petros.session-state.v1';

CREATE TABLE IF NOT EXISTS petros_question_specs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES petros_learning_sessions(id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES petros_teaching_blocks(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  root_question_id uuid NOT NULL,
  parent_question_id uuid,
  target_id text NOT NULL,
  equivalence_key text NOT NULL,
  prompt text NOT NULL,
  response_type text NOT NULL,
  choices jsonb,
  purpose text NOT NULL,
  evaluation_mode text NOT NULL,
  acceptable_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_choice_id text,
  rubric text,
  hint text NOT NULL,
  missing_step text NOT NULL,
  worked_solution text NOT NULL,
  reworded_prompt text NOT NULL,
  attempt_ordinal integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_question_specs_response_ck CHECK (response_type IN ('short_answer', 'single_choice')),
  CONSTRAINT petros_question_specs_purpose_ck CHECK (purpose IN ('guess_first', 'recall', 'equivalent_retry', 'reworded_success')),
  CONSTRAINT petros_question_specs_evaluator_ck CHECK (evaluation_mode IN ('deterministic', 'ai')),
  CONSTRAINT petros_question_specs_ordinal_ck CHECK (attempt_ordinal > 0)
);
CREATE INDEX IF NOT EXISTS petros_question_specs_block_idx ON petros_question_specs (block_id, created_at);
CREATE INDEX IF NOT EXISTS petros_question_specs_owner_idx ON petros_question_specs (institution_id, student_id, created_at);
CREATE INDEX IF NOT EXISTS petros_question_specs_equivalence_idx ON petros_question_specs (session_id, equivalence_key);

CREATE TABLE IF NOT EXISTS petros_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES petros_learning_sessions(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  decision_id uuid REFERENCES petros_planning_decisions(id) ON DELETE SET NULL,
  block_id uuid REFERENCES petros_teaching_blocks(id) ON DELETE SET NULL,
  question_id uuid REFERENCES petros_question_specs(id) ON DELETE SET NULL,
  type text NOT NULL,
  target_id text,
  raw_answer text,
  confidence text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_version text NOT NULL,
  occurred_at timestamptz NOT NULL,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_observations_type_ck CHECK (type IN ('answer_submitted', 'confidence_selected', 'question_asked', 'hint_requested', 'layer_changed', 'depth_changed', 'block_completed', 'block_skipped', 'session_paused', 'session_resumed', 'session_abandoned', 'response_time_recorded', 'inactivity_recorded')),
  CONSTRAINT petros_observations_confidence_ck CHECK (confidence IS NULL OR confidence IN ('sure', 'think_so', 'guessing'))
);
CREATE INDEX IF NOT EXISTS petros_observations_session_idx ON petros_observations (session_id, occurred_at);
CREATE INDEX IF NOT EXISTS petros_observations_owner_idx ON petros_observations (institution_id, student_id, occurred_at);
CREATE INDEX IF NOT EXISTS petros_observations_type_idx ON petros_observations (type, occurred_at);
CREATE INDEX IF NOT EXISTS petros_observations_question_idx ON petros_observations (question_id, occurred_at);
CREATE INDEX IF NOT EXISTS petros_observations_correlation_idx ON petros_observations (correlation_id);

CREATE TABLE IF NOT EXISTS petros_answer_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES petros_observations(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES petros_learning_sessions(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES petros_question_specs(id) ON DELETE CASCADE,
  correctness text NOT NULL,
  credit_basis_points integer NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_class text NOT NULL,
  misconception text,
  feedback text NOT NULL,
  safe_next_hint text,
  high_value_misconception boolean NOT NULL DEFAULT false,
  fragile_success boolean NOT NULL DEFAULT false,
  evaluator text NOT NULL,
  function_key text,
  prompt_version text NOT NULL,
  schema_version text NOT NULL,
  request_id uuid,
  route_reference jsonb,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_answer_evaluations_observation_uniq UNIQUE (observation_id),
  CONSTRAINT petros_answer_evaluations_correctness_ck CHECK (correctness IN ('correct', 'incorrect', 'partial', 'invalid')),
  CONSTRAINT petros_answer_evaluations_credit_ck CHECK (credit_basis_points BETWEEN 0 AND 10000),
  CONSTRAINT petros_answer_evaluations_evaluator_ck CHECK (evaluator IN ('deterministic', 'ai', 'safe_fallback'))
);
CREATE INDEX IF NOT EXISTS petros_answer_evaluations_owner_idx ON petros_answer_evaluations (institution_id, student_id, created_at);
CREATE INDEX IF NOT EXISTS petros_answer_evaluations_matrix_idx ON petros_answer_evaluations (correctness, created_at);
CREATE INDEX IF NOT EXISTS petros_answer_evaluations_correlation_idx ON petros_answer_evaluations (correlation_id);

CREATE TABLE IF NOT EXISTS petros_struggle_stretches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES petros_learning_sessions(id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES petros_teaching_blocks(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  target_id text NOT NULL,
  equivalence_key text NOT NULL,
  wrong_attempt_count integer NOT NULL DEFAULT 0,
  ladder_level integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  reworded_question_id uuid,
  last_observation_id uuid,
  recovered_at timestamptz,
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_struggle_stretches_equivalence_uniq UNIQUE (session_id, equivalence_key),
  CONSTRAINT petros_struggle_stretches_status_ck CHECK (status IN ('active', 'reworded', 'recovered', 'stuck_support')),
  CONSTRAINT petros_struggle_stretches_ladder_ck CHECK (wrong_attempt_count >= 0 AND ladder_level BETWEEN 0 AND 4)
);
CREATE INDEX IF NOT EXISTS petros_struggle_stretches_owner_idx ON petros_struggle_stretches (institution_id, student_id, created_at);
CREATE INDEX IF NOT EXISTS petros_struggle_stretches_status_idx ON petros_struggle_stretches (status, updated_at);

CREATE TABLE IF NOT EXISTS petros_session_detours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES petros_learning_sessions(id) ON DELETE CASCADE,
  observation_id uuid NOT NULL REFERENCES petros_observations(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  question text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  action text NOT NULL DEFAULT 'pending',
  acknowledgement text,
  route_change text,
  return_plan text,
  changed_decision_id uuid REFERENCES petros_planning_decisions(id) ON DELETE SET NULL,
  rejoined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_session_detours_status_ck CHECK (status IN ('pending', 'active', 'parked', 'clarifying', 'rejoined')),
  CONSTRAINT petros_session_detours_action_ck CHECK (action IN ('pending', 'answer_now', 'clarify', 'park', 'change_subgoal'))
);
CREATE INDEX IF NOT EXISTS petros_session_detours_session_idx ON petros_session_detours (session_id, created_at);
CREATE INDEX IF NOT EXISTS petros_session_detours_owner_idx ON petros_session_detours (institution_id, student_id, created_at);
CREATE INDEX IF NOT EXISTS petros_session_detours_status_idx ON petros_session_detours (status, created_at);
