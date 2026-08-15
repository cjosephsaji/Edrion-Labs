-- Petros Stage 2: persistent, institution-scoped PLAN -> RENDER learning loop.

CREATE TABLE IF NOT EXISTS petros_learning_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  client_request_id uuid NOT NULL,
  state_version text NOT NULL,
  session_type text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  topic text NOT NULL,
  current_goal text NOT NULL,
  time_budget_seconds integer NOT NULL,
  elapsed_seconds integer NOT NULL DEFAULT 0,
  active_since timestamptz,
  max_moves integer NOT NULL,
  checkpoints jsonb NOT NULL,
  current_checkpoint_id text NOT NULL,
  learner_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  topic_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_context jsonb,
  prompt_version text NOT NULL,
  output_schema_version text NOT NULL,
  planning_started_at timestamptz,
  close_reason text,
  closed_at timestamptz,
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_learning_sessions_status_ck CHECK (status IN ('active', 'paused', 'closed')),
  CONSTRAINT petros_learning_sessions_type_ck CHECK (session_type IN ('learn', 'revise', 'repair', 'doubt')),
  CONSTRAINT petros_learning_sessions_budget_ck CHECK (time_budget_seconds > 0 AND elapsed_seconds >= 0),
  CONSTRAINT petros_learning_sessions_moves_ck CHECK (max_moves BETWEEN 1 AND 20),
  CONSTRAINT petros_learning_sessions_owner_request_uniq UNIQUE (institution_id, student_id, client_request_id)
);
CREATE INDEX IF NOT EXISTS petros_learning_sessions_owner_created_idx ON petros_learning_sessions (institution_id, student_id, created_at);
CREATE INDEX IF NOT EXISTS petros_learning_sessions_planning_idx ON petros_learning_sessions (status, planning_started_at);

CREATE TABLE IF NOT EXISTS petros_planning_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES petros_learning_sessions(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  selected_move_type text NOT NULL,
  original_move_type text,
  target_concept text NOT NULL,
  student_safe_reason text NOT NULL,
  decision_factors jsonb NOT NULL,
  move_parameters jsonb NOT NULL,
  expected_evidence text NOT NULL,
  progress_effect jsonb NOT NULL,
  can_stream boolean NOT NULL DEFAULT false,
  termination jsonb NOT NULL,
  policy_interventions jsonb NOT NULL DEFAULT '[]'::jsonb,
  observed_outcome jsonb,
  source text NOT NULL,
  function_key text NOT NULL,
  prompt_version text NOT NULL,
  schema_version text NOT NULL,
  route_reference jsonb,
  plan_request_id uuid,
  render_request_id uuid,
  correlation_id uuid NOT NULL,
  resulting_block_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_planning_decisions_session_sequence_uniq UNIQUE (session_id, sequence),
  CONSTRAINT petros_planning_decisions_status_ck CHECK (status IN ('planned', 'rendered', 'completed', 'failed', 'overridden')),
  CONSTRAINT petros_planning_decisions_move_ck CHECK (selected_move_type IN ('layered_explanation', 'worked_example', 'recall_check', 'synthesis')),
  CONSTRAINT petros_planning_decisions_source_ck CHECK (source IN ('ai', 'deterministic_fallback'))
);
CREATE INDEX IF NOT EXISTS petros_planning_decisions_owner_idx ON petros_planning_decisions (institution_id, student_id, created_at);
CREATE INDEX IF NOT EXISTS petros_planning_decisions_correlation_idx ON petros_planning_decisions (correlation_id);
CREATE INDEX IF NOT EXISTS petros_planning_decisions_source_idx ON petros_planning_decisions (source, created_at);

CREATE TABLE IF NOT EXISTS petros_teaching_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES petros_learning_sessions(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL REFERENCES petros_planning_decisions(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'current',
  content jsonb NOT NULL,
  interaction_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_outcome jsonb,
  delivery text NOT NULL,
  function_key text NOT NULL,
  prompt_version text NOT NULL,
  schema_version text NOT NULL,
  route_reference jsonb,
  correlation_id uuid NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_teaching_blocks_session_sequence_uniq UNIQUE (session_id, sequence),
  CONSTRAINT petros_teaching_blocks_decision_uniq UNIQUE (decision_id),
  CONSTRAINT petros_teaching_blocks_status_ck CHECK (status IN ('current', 'completed')),
  CONSTRAINT petros_teaching_blocks_type_ck CHECK (type IN ('layered_explanation', 'worked_example', 'recall_check', 'synthesis')),
  CONSTRAINT petros_teaching_blocks_delivery_ck CHECK (delivery IN ('ai', 'deterministic_fallback'))
);
CREATE INDEX IF NOT EXISTS petros_teaching_blocks_owner_idx ON petros_teaching_blocks (institution_id, student_id, created_at);
CREATE INDEX IF NOT EXISTS petros_teaching_blocks_correlation_idx ON petros_teaching_blocks (correlation_id);

ALTER TABLE petros_planning_decisions
  ADD CONSTRAINT petros_planning_decisions_block_fk
  FOREIGN KEY (resulting_block_id) REFERENCES petros_teaching_blocks(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS petros_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES petros_learning_sessions(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  decision_id uuid REFERENCES petros_planning_decisions(id) ON DELETE SET NULL,
  block_id uuid REFERENCES petros_teaching_blocks(id) ON DELETE SET NULL,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS petros_session_events_session_idx ON petros_session_events (session_id, created_at);
CREATE INDEX IF NOT EXISTS petros_session_events_owner_idx ON petros_session_events (institution_id, student_id, created_at);
CREATE INDEX IF NOT EXISTS petros_session_events_type_idx ON petros_session_events (type, created_at);
CREATE INDEX IF NOT EXISTS petros_session_events_correlation_idx ON petros_session_events (correlation_id);

CREATE TABLE IF NOT EXISTS petros_session_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES petros_learning_sessions(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  command text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',
  response jsonb,
  error_code text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_session_commands_session_key_uniq UNIQUE (session_id, idempotency_key),
  CONSTRAINT petros_session_commands_status_ck CHECK (status IN ('in_progress', 'completed', 'failed'))
);
CREATE INDEX IF NOT EXISTS petros_session_commands_owner_idx ON petros_session_commands (institution_id, student_id, created_at);
CREATE INDEX IF NOT EXISTS petros_session_commands_in_flight_idx ON petros_session_commands (session_id, status, created_at);
