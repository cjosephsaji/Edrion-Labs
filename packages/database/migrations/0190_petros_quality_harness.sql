-- Stage 5 Petros teaching-quality harness. Synthetic evaluation records have no student FK.
CREATE TABLE IF NOT EXISTS petros_quality_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), external_run_id text NOT NULL UNIQUE, label text NOT NULL,
  status text NOT NULL, mode text NOT NULL CHECK (mode IN ('fixture','live')), source text NOT NULL DEFAULT 'evaluation' CHECK (source = 'evaluation'),
  environment text NOT NULL DEFAULT 'evaluation' CHECK (environment = 'evaluation'), suite text NOT NULL, seed bigint NOT NULL,
  gate text NOT NULL CHECK (gate IN ('pass','warn','fail')), corpus_version text NOT NULL, rubric_version text NOT NULL,
  prompt_version text NOT NULL, schema_version text NOT NULL, profile_version text NOT NULL, routing_version text NOT NULL, code_version text NOT NULL,
  selection jsonb NOT NULL DEFAULT '{}'::jsonb, limits jsonb NOT NULL DEFAULT '{}'::jsonb, totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb, blocking_failures jsonb NOT NULL DEFAULT '[]'::jsonb, warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  comparison jsonb, report jsonb NOT NULL, cost_micros bigint NOT NULL DEFAULT 0, input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0, latency_ms integer NOT NULL DEFAULT 0, started_at timestamptz NOT NULL, completed_at timestamptz,
  created_by uuid, updated_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS petros_quality_runs_status_idx ON petros_quality_runs(status, created_at);
CREATE INDEX IF NOT EXISTS petros_quality_runs_gate_idx ON petros_quality_runs(gate, created_at);

CREATE TABLE IF NOT EXISTS petros_quality_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES petros_quality_runs(id) ON DELETE CASCADE,
  external_session_id text NOT NULL, case_id text NOT NULL, topic_key text NOT NULL, topic_title text NOT NULL, subject text NOT NULL,
  persona_id text NOT NULL, goal text NOT NULL, seed bigint NOT NULL, total_score_basis_points integer NOT NULL, status text NOT NULL,
  blocking_failures jsonb NOT NULL DEFAULT '[]'::jsonb, warnings jsonb NOT NULL DEFAULT '[]'::jsonb, transcript jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(run_id, external_session_id)
);
CREATE INDEX IF NOT EXISTS petros_quality_sessions_matrix_idx ON petros_quality_sessions(run_id, topic_key, persona_id);

CREATE TABLE IF NOT EXISTS petros_quality_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES petros_quality_runs(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES petros_quality_sessions(id) ON DELETE CASCADE, external_event_id text NOT NULL,
  event_type text NOT NULL, move_type text, function_key text, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id, external_event_id)
);
CREATE INDEX IF NOT EXISTS petros_quality_events_type_idx ON petros_quality_events(run_id, event_type);

CREATE TABLE IF NOT EXISTS petros_quality_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES petros_quality_runs(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES petros_quality_sessions(id) ON DELETE CASCADE, dimension text NOT NULL,
  score_basis_points integer NOT NULL, max_score_basis_points integer NOT NULL DEFAULT 500, evaluator text NOT NULL,
  uncertainty_basis_points integer NOT NULL, rationale text NOT NULL, evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  rubric_version text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id, dimension)
);
CREATE INDEX IF NOT EXISTS petros_quality_scores_dimension_idx ON petros_quality_scores(run_id, dimension);

CREATE TABLE IF NOT EXISTS petros_quality_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL UNIQUE REFERENCES petros_quality_runs(id) ON DELETE RESTRICT,
  selected boolean NOT NULL DEFAULT true, reason text NOT NULL, promoted_by uuid, promoted_at timestamptz NOT NULL DEFAULT now(), retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS petros_quality_baselines_selected_idx ON petros_quality_baselines(selected, promoted_at);

CREATE TABLE IF NOT EXISTS petros_quality_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid REFERENCES petros_quality_runs(id) ON DELETE SET NULL,
  action text NOT NULL, actor_ref text, reason text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
