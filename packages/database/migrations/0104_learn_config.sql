-- 0104_learn_config
-- Petros Learn conformance, Phase D (config namespace).
--
-- Hyperspec 3 §2 binds every Learn cost/behaviour knob to the config namespace
-- `learn.*`, and its AC-5 requires that changing `move_cap` take effect at
-- runtime with no deploy of new code paths. Today those knobs are TypeScript
-- constants (apps/api/.../edrion-learn/constants.ts), so changing one is a
-- deploy. This migration adds the store they resolve through.
--
-- Why a new table rather than an existing mechanism:
--   * `packages/config` is an env-only Zod schema — env vars are a deploy.
--   * `features.default_value` is BOOLEAN — it cannot carry `move_cap = 14`
--     or `render_model_tier = 'mid'`.
--   * `institution_settings.institution_id` is NOT NULL — it can express
--     neither a global default nor a value for an independent-tier learner,
--     and Learn serves both.
--
-- Scope layers implemented: global -> institution -> independent_user, most
-- specific wins. The repo's full flag order also has plan and campus layers;
-- they are deliberately omitted here. A plan layer would make per-session LLM
-- spend a billing-plan entitlement, which is a commercial decision nobody has
-- made, and a campus layer has no meaning for the independent tier that shares
-- these knobs. Both can be added later as new `scope` values plus one more
-- partial unique index without touching the resolution contract, since the
-- service resolves by precedence rank rather than by an exhaustive join.
--
-- Idempotent, and safe to apply to a live database: an EMPTY learn_config
-- reproduces today's behaviour exactly, because LearnConfigService falls back
-- to the same compile-time constants for every key it does not find.

CREATE TABLE IF NOT EXISTS learn_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  scope text NOT NULL DEFAULT 'global',
  institution_id uuid REFERENCES institutions (id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users (id) ON DELETE CASCADE,
  value_type text NOT NULL,
  value text NOT NULL,
  description text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only the namespace this table owns.
ALTER TABLE learn_config DROP CONSTRAINT IF EXISTS learn_config_key_ck;
ALTER TABLE learn_config ADD CONSTRAINT learn_config_key_ck
  CHECK (key ~ '^learn\.[a-z0-9_]+$');

ALTER TABLE learn_config DROP CONSTRAINT IF EXISTS learn_config_scope_ck;
ALTER TABLE learn_config ADD CONSTRAINT learn_config_scope_ck
  CHECK (scope IN ('global', 'institution', 'independent_user'));

ALTER TABLE learn_config DROP CONSTRAINT IF EXISTS learn_config_value_type_ck;
ALTER TABLE learn_config ADD CONSTRAINT learn_config_value_type_ck
  CHECK (value_type IN ('number', 'string', 'boolean'));

-- Phase C (0103) tenancy convention: owner cardinality stated as num_nonnulls.
-- A global row is ownerless by definition, so the rule is scope-conditional
-- rather than a flat `= 1`: the scope discriminator and the owner columns must
-- agree, or a row could claim institution scope while carrying no institution.
ALTER TABLE learn_config DROP CONSTRAINT IF EXISTS learn_config_owner_ck;
ALTER TABLE learn_config ADD CONSTRAINT learn_config_owner_ck
  CHECK (
    (scope = 'global' AND num_nonnulls(institution_id, independent_user_id) = 0)
    OR (scope = 'institution' AND institution_id IS NOT NULL AND independent_user_id IS NULL)
    OR (scope = 'independent_user' AND independent_user_id IS NOT NULL AND institution_id IS NULL)
  );

-- Uniqueness per (key, scope, scope_id). Three partial unique indexes rather
-- than one COALESCE expression, matching learn_topic_profiles (0096/0103).
CREATE UNIQUE INDEX IF NOT EXISTS learn_config_global_key_uq
  ON learn_config (key)
  WHERE scope = 'global';

CREATE UNIQUE INDEX IF NOT EXISTS learn_config_institution_key_uq
  ON learn_config (institution_id, key)
  WHERE scope = 'institution';

CREATE UNIQUE INDEX IF NOT EXISTS learn_config_independent_key_uq
  ON learn_config (independent_user_id, key)
  WHERE scope = 'independent_user';

-- The service's read is a single scan of the whole namespace per resolution
-- (11 keys, cached 30s), filtered by owner. These serve that filter.
CREATE INDEX IF NOT EXISTS learn_config_institution_idx
  ON learn_config (institution_id)
  WHERE institution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS learn_config_independent_user_idx
  ON learn_config (independent_user_id)
  WHERE independent_user_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed the hyperspec §2 defaults at global scope.
-- ─────────────────────────────────────────────────────────────────────────────
-- These are the same values the service falls back to in code, written here so
-- the table is self-documenting: an operator reading learn_config sees the full
-- knob set and its shape without reading TypeScript. ON CONFLICT DO NOTHING so
-- re-running never clobbers an operator's tuned value.
--
-- learn.render_model_tier is 'mid' per the §2 table. The renderer currently
-- hardcodes tier 'small'; making it read this value is a separate change.
INSERT INTO learn_config (key, scope, value_type, value, description) VALUES
  ('learn.move_cap',                       'global', 'number',  '14',    'Max planned moves per session (hyperspec 1 §4.2).'),
  ('learn.profile_ttl_days',               'global', 'number',  '180',   'Topic-profile cache TTL; human overrides never expire.'),
  ('learn.plan_model_tier',                'global', 'string',  'small', 'Move planner tier; temperature 0, max_tokens 400.'),
  ('learn.render_model_tier',              'global', 'string',  'mid',   'Block renderer tier; streamed, max_tokens 1600.'),
  ('learn.grade_model_tier',               'global', 'string',  'small', 'Short-text grading micro-call; max_tokens 120.'),
  ('learn.judge_model_tier',               'global', 'string',  'mid',   'Eval-harness judge tier.'),
  ('learn.profiler_model_tier',            'global', 'string',  'small', 'Topic profiler tier; max_tokens 600.'),
  ('learn.max_free_questions_per_session', 'global', 'number',  '5',     'Free-question allowance; the 6th gets fixed copy.'),
  ('learn.daily_session_cap_per_user',     'global', 'number',  '12',    'Anti-abuse; the 13th session returns 429.'),
  ('learn.speculative_planning',           'global', 'boolean', 'true',  'Speculative planning on; results are discardable.'),
  ('learn.default_session_minutes',        'global', 'number',  '15',    'Default session length in minutes.')
ON CONFLICT DO NOTHING;
