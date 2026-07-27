-- 0105_learn_status_check_and_config_rls
-- Two residual Phase D items that the application-layer work could not own.
-- Idempotent and safe to re-run.

-- ── 1. orchestrator_status closed set ────────────────────────────────────────
-- `learn_sessions.orchestrator_status` is a nullable free-text column with no
-- CHECK, so the state machine's closed set was enforced only in the app layer
-- (orchestratorStatusSchema in packages/schemas/.../state.ts). Bring the DB in
-- line so a bad write cannot silently create an unreachable session state.
-- NULL stays legal: rows written by the legacy student/learn/ surface never set
-- this column, and that surface is still live.
UPDATE learn_sessions
SET orchestrator_status = NULL
WHERE orchestrator_status IS NOT NULL
  AND orchestrator_status NOT IN ('created', 'active', 'awaiting_response', 'paused', 'closing', 'closed');

ALTER TABLE learn_sessions DROP CONSTRAINT IF EXISTS learn_sessions_orchestrator_status_ck;
ALTER TABLE learn_sessions ADD CONSTRAINT learn_sessions_orchestrator_status_ck
  CHECK (
    orchestrator_status IS NULL
    OR orchestrator_status IN ('created', 'active', 'awaiting_response', 'paused', 'closing', 'closed')
  );

-- ── 2. RLS for learn_config ──────────────────────────────────────────────────
-- learn_config (0104) is tenant-tunable knob storage. Global-scope rows are
-- ownerless platform defaults and must stay readable by everyone; institution-
-- and independent-user-scoped rows are private to their owner.
--
-- NOTE: as configured today the API connects as a superuser (BYPASSRLS), so
-- this is defence in depth and cannot change current behaviour. Same posture as
-- the nine Learn tables enabled in 0103.
ALTER TABLE learn_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_config FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learn_config_owner_private ON learn_config;
CREATE POLICY learn_config_owner_private ON learn_config
  FOR ALL
  USING (
    scope = 'global'
    OR (
      edrion_current_institution() IS NOT NULL
      AND institution_id::text = edrion_current_institution()
    )
    OR (
      edrion_current_independent_user() IS NOT NULL
      AND independent_user_id::text = edrion_current_independent_user()
    )
    -- No learner context set (server/admin path): fall through, matching the
    -- allow-all-when-unset convention used by the other Learn policies.
    OR (
      edrion_current_institution() IS NULL
      AND edrion_current_independent_user() IS NULL
    )
  );
