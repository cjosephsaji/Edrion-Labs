-- Petros provider-independent AI routing control plane.

CREATE TABLE IF NOT EXISTS petros_ai_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  adapter_type text NOT NULL,
  base_url text,
  credential_envelope text,
  credential_hint text,
  enabled boolean NOT NULL DEFAULT true,
  paused boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100,
  daily_budget_micros bigint,
  monthly_budget_micros bigint,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  health_status text NOT NULL DEFAULT 'unknown',
  latency_ms integer,
  last_health_check_at timestamptz,
  last_health_error text,
  version integer NOT NULL DEFAULT 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_ai_provider_priority_ck CHECK (priority >= 0),
  CONSTRAINT petros_ai_provider_budget_ck CHECK (
    (daily_budget_micros IS NULL OR daily_budget_micros >= 0) AND
    (monthly_budget_micros IS NULL OR monthly_budget_micros >= 0)
  )
);
CREATE INDEX IF NOT EXISTS petros_ai_providers_enabled_priority_idx
  ON petros_ai_providers (enabled, paused, priority);

CREATE TABLE IF NOT EXISTS petros_ai_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES petros_ai_providers(id) ON DELETE CASCADE,
  model_key text NOT NULL,
  display_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  custom boolean NOT NULL DEFAULT false,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_window integer,
  max_output_tokens integer,
  pricing jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_ai_models_provider_model_uniq UNIQUE (provider_id, model_key),
  CONSTRAINT petros_ai_model_limits_ck CHECK (
    (context_window IS NULL OR context_window > 0) AND
    (max_output_tokens IS NULL OR max_output_tokens > 0)
  )
);
CREATE INDEX IF NOT EXISTS petros_ai_models_provider_idx
  ON petros_ai_models (provider_id, enabled);

CREATE TABLE IF NOT EXISTS petros_ai_functions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  allowed_input_types jsonb NOT NULL DEFAULT '["text"]'::jsonb,
  response_format text NOT NULL DEFAULT 'text',
  required_capabilities jsonb NOT NULL DEFAULT '["text"]'::jsonb,
  settings jsonb NOT NULL,
  active_prompt_version text NOT NULL DEFAULT 'v1',
  active_schema_version text NOT NULL DEFAULT 'v1',
  source text NOT NULL DEFAULT 'builtin',
  version integer NOT NULL DEFAULT 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS petros_ai_functions_category_idx
  ON petros_ai_functions (category, enabled);

CREATE TABLE IF NOT EXISTS petros_ai_function_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id uuid NOT NULL REFERENCES petros_ai_functions(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES petros_ai_providers(id) ON DELETE RESTRICT,
  model_id uuid NOT NULL REFERENCES petros_ai_models(id) ON DELETE RESTRICT,
  tier integer NOT NULL DEFAULT 0,
  traffic_percent integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_ai_function_routes_uniq UNIQUE (function_id, tier, provider_id, model_id),
  CONSTRAINT petros_ai_route_tier_ck CHECK (tier BETWEEN 0 AND 2),
  CONSTRAINT petros_ai_route_traffic_ck CHECK (traffic_percent BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS petros_ai_function_routes_function_tier_idx
  ON petros_ai_function_routes (function_id, tier, enabled);

CREATE TABLE IF NOT EXISTS petros_ai_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  function_id uuid REFERENCES petros_ai_functions(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  action jsonb NOT NULL,
  version integer NOT NULL DEFAULT 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_ai_rule_priority_ck CHECK (priority >= 0)
);
CREATE INDEX IF NOT EXISTS petros_ai_routing_rules_priority_idx
  ON petros_ai_routing_rules (enabled, priority);
CREATE INDEX IF NOT EXISTS petros_ai_routing_rules_function_idx
  ON petros_ai_routing_rules (function_id);

CREATE TABLE IF NOT EXISTS petros_ai_function_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id uuid NOT NULL REFERENCES petros_ai_functions(id) ON DELETE CASCADE,
  prompt_version text NOT NULL,
  schema_version text NOT NULL,
  prompt_template text NOT NULL,
  response_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_ai_function_versions_uniq UNIQUE (function_id, prompt_version, schema_version),
  CONSTRAINT petros_ai_function_version_status_ck CHECK (status IN ('draft', 'active', 'archived'))
);
CREATE INDEX IF NOT EXISTS petros_ai_function_versions_function_status_idx
  ON petros_ai_function_versions (function_id, status);

CREATE TABLE IF NOT EXISTS petros_ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  session_id uuid,
  student_id uuid,
  independent_user_id uuid,
  institution_id uuid,
  function_id uuid NOT NULL REFERENCES petros_ai_functions(id) ON DELETE RESTRICT,
  provider_id uuid NOT NULL REFERENCES petros_ai_providers(id) ON DELETE RESTRICT,
  model_id uuid NOT NULL REFERENCES petros_ai_models(id) ON DELETE RESTRICT,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cached_tokens integer NOT NULL DEFAULT 0,
  estimated_cost_micros bigint NOT NULL DEFAULT 0,
  actual_cost_micros bigint,
  response_time_ms integer NOT NULL,
  status text NOT NULL,
  error_code text,
  retry_count integer NOT NULL DEFAULT 0,
  fallback_tier integer NOT NULL DEFAULT 0,
  cache_status text NOT NULL DEFAULT 'miss',
  experiment_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_ai_usage_status_ck CHECK (status IN ('success', 'failure', 'rejected', 'cached')),
  CONSTRAINT petros_ai_usage_nonnegative_ck CHECK (
    input_tokens >= 0 AND output_tokens >= 0 AND cached_tokens >= 0 AND
    estimated_cost_micros >= 0 AND (actual_cost_micros IS NULL OR actual_cost_micros >= 0) AND
    response_time_ms >= 0 AND retry_count >= 0 AND fallback_tier BETWEEN 0 AND 2
  )
);
CREATE INDEX IF NOT EXISTS petros_ai_usage_events_request_idx ON petros_ai_usage_events (request_id);
CREATE INDEX IF NOT EXISTS petros_ai_usage_events_created_idx ON petros_ai_usage_events (created_at);
CREATE INDEX IF NOT EXISTS petros_ai_usage_events_function_created_idx ON petros_ai_usage_events (function_id, created_at);
CREATE INDEX IF NOT EXISTS petros_ai_usage_events_provider_created_idx ON petros_ai_usage_events (provider_id, created_at);
CREATE INDEX IF NOT EXISTS petros_ai_usage_events_institution_created_idx ON petros_ai_usage_events (institution_id, created_at);
CREATE INDEX IF NOT EXISTS petros_ai_usage_events_student_created_idx ON petros_ai_usage_events (student_id, created_at);

CREATE TABLE IF NOT EXISTS petros_ai_budget_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'global',
  scope_id text,
  monthly_budget_micros bigint,
  daily_budget_micros bigint,
  thresholds jsonb NOT NULL DEFAULT '[
    {"percent":70,"action":"warn"},
    {"percent":90,"action":"restrict_expensive"},
    {"percent":95,"action":"route_to_lower_cost"},
    {"percent":100,"action":"stop_non_essential"}
  ]'::jsonb,
  preserve_essential_functions boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_ai_budget_scope_uniq UNIQUE NULLS NOT DISTINCT (scope, scope_id),
  CONSTRAINT petros_ai_budget_nonnegative_ck CHECK (
    (daily_budget_micros IS NULL OR daily_budget_micros >= 0) AND
    (monthly_budget_micros IS NULL OR monthly_budget_micros >= 0)
  )
);

INSERT INTO petros_ai_budget_policies (scope, scope_id)
VALUES ('global', NULL)
ON CONFLICT (scope, scope_id) DO NOTHING;
