-- DEC-16: migrate student_tutor Learn policy knobs into ai_policies.capabilities
-- (same grammar as admin Copilot). domain_config retained as read-fallback until P3 UI lands.

ALTER TYPE ai_capability ADD VALUE IF NOT EXISTS 'curriculum_bounds';
ALTER TYPE ai_capability ADD VALUE IF NOT EXISTS 'answer_directness';
ALTER TYPE ai_capability ADD VALUE IF NOT EXISTS 'session_visibility';

-- Copy enum strings from domain_config into capabilities for every student_tutor row.
UPDATE ai_policies
SET capabilities = coalesce(capabilities, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
  'curriculum_bounds', domain_config -> 'curriculum_bounds',
  'answer_directness', domain_config -> 'answer_directness',
  'session_visibility', domain_config -> 'session_visibility'
))
WHERE policy_domain = 'student_tutor'
  AND (
    domain_config ? 'curriculum_bounds'
    OR domain_config ? 'answer_directness'
    OR domain_config ? 'session_visibility'
  );

-- Ensure the global P1 permissive default exists with capabilities populated.
INSERT INTO ai_policies (
  scope, scope_id, enabled, mode, policy_domain, capabilities, domain_config, reason, set_by_name, version
)
SELECT
  'global', NULL, true, 'full', 'student_tutor',
  '{"curriculum_bounds":"open","answer_directness":"default","session_visibility":"none"}'::jsonb,
  '{"v":1,"curriculum_bounds":"open","answer_directness":"default","session_visibility":"none"}'::jsonb,
  'Edrion Learn P1 permissive default (DEC-16 capabilities)', 'system', 1
WHERE NOT EXISTS (
  SELECT 1 FROM ai_policies
  WHERE policy_domain = 'student_tutor' AND scope = 'global' AND scope_id IS NULL
);

UPDATE ai_policies
SET capabilities = coalesce(capabilities, '{}'::jsonb) || '{"curriculum_bounds":"open","answer_directness":"default","session_visibility":"none"}'::jsonb,
    reason = coalesce(reason, 'Edrion Learn P1 permissive default (DEC-16 capabilities)')
WHERE policy_domain = 'student_tutor'
  AND scope = 'global'
  AND scope_id IS NULL
  AND (
    capabilities IS NULL
    OR NOT (capabilities ? 'curriculum_bounds')
  );
