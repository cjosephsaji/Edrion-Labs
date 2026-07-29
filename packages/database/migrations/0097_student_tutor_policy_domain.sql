-- P1.2: student_tutor policy domain on ai_policies + learn.orchestrator flag.

ALTER TABLE ai_policies
  ADD COLUMN IF NOT EXISTS policy_domain text NOT NULL DEFAULT 'copilot',
  ADD COLUMN IF NOT EXISTS domain_config jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  ALTER TABLE ai_policies ADD CONSTRAINT ai_policies_policy_domain_ck CHECK (
    policy_domain IN ('copilot', 'student_tutor')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP INDEX IF EXISTS ai_policies_scope_idx;
CREATE INDEX IF NOT EXISTS ai_policies_scope_domain_idx ON ai_policies (scope, scope_id, policy_domain);

-- Global permissive student_tutor default (P1).
INSERT INTO ai_policies (
  scope, scope_id, enabled, mode, policy_domain, domain_config, reason, set_by_name, version
)
SELECT
  'global', NULL, true, 'full', 'student_tutor',
  '{"v":1,"curriculum_bounds":"open","answer_directness":"default","session_visibility":"none"}'::jsonb,
  'Edrion Learn P1 permissive default', 'system', 1
WHERE NOT EXISTS (
  SELECT 1 FROM ai_policies
  WHERE policy_domain = 'student_tutor' AND scope = 'global' AND scope_id IS NULL
);

INSERT INTO feature_definitions(key, name, description, module, status, default_value, available_scopes, dependencies, release_stage, owner)
VALUES (
  'learn.orchestrator',
  'Edrion Learn orchestrator',
  'Adaptive pedagogy orchestrator for Edrion Learn sessions',
  'student-portal',
  'active',
  true,
  '["global","plan","institution","campus","institution_user","independent_user"]',
  '["student.surface.learn"]',
  'ga',
  'student-experience'
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  dependencies = EXCLUDED.dependencies;
