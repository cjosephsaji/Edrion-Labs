-- Edrion Learn P1.2: student_tutor policy domain on ai_policies + learn.orchestrator flag.

ALTER TABLE ai_policies
  ADD COLUMN IF NOT EXISTS policy_domain text NOT NULL DEFAULT 'copilot',
  ADD COLUMN IF NOT EXISTS domain_config jsonb NOT NULL DEFAULT '{}';
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE ai_policies ADD CONSTRAINT ai_policies_policy_domain_ck CHECK (
    policy_domain IN ('copilot', 'student_tutor')
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS ai_policies_scope_domain_uq
  ON ai_policies (scope, scope_id, policy_domain);
--> statement-breakpoint

INSERT INTO ai_policies (
  scope,
  scope_id,
  enabled,
  mode,
  policy_domain,
  domain_config,
  kill_switch,
  reason,
  set_by_name
)
SELECT
  'global',
  NULL,
  true,
  'full',
  'student_tutor',
  jsonb_build_object(
    'v', 1,
    'curriculum_bounds', 'open',
    'answer_directness', 'default',
    'session_visibility', 'none'
  ),
  false,
  'Edrion Learn P1.2 global permissive default',
  'system'
WHERE NOT EXISTS (
  SELECT 1 FROM ai_policies
  WHERE policy_domain = 'student_tutor' AND scope = 'global' AND scope_id IS NULL
);
--> statement-breakpoint

INSERT INTO feature_definitions (key, name, description, module, status, default_value, available_scopes, dependencies, release_stage, owner)
VALUES (
  'learn.orchestrator',
  'Edrion Learn orchestrator',
  'Stateful teaching sessions with the new pedagogy orchestrator (replaces legacy lesson flow)',
  'student-portal',
  'active',
  false,
  '["global","plan","institution","campus","institution_user","independent_user"]',
  '["student.surface.learn"]',
  'beta',
  'student-experience'
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  default_value = EXCLUDED.default_value,
  dependencies = EXCLUDED.dependencies,
  release_stage = EXCLUDED.release_stage;
