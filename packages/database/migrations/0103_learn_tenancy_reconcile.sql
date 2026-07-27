-- 0103_learn_tenancy_reconcile
-- Petros Learn conformance, Phase C (schema/tenancy).
--
-- Three things, all idempotent and all safe to re-run:
--   1. DEC-1  — apply ONE owner-XOR form uniformly across every Learn table.
--   2. DEC-5  — learner_mastery.rating default 800 -> 1200 (+ untouched-row backfill).
--   3. DEC-11 — make the Plan-02 leftovers nullable so the orchestrator can stop
--               writing meaningless stubs.
-- RLS for the nine uncovered Learn tables lands in migrations/sql/zzz_rls.sql,
-- which src/migrate.ts applies after the numbered migrations.
--
-- DEC-1 note: the hyperspec's §1.0 `owner_kind` + single `user_id` form is NOT
-- adopted. This repo has no unified user identity (`students.id` is itself
-- institution-scoped) and RLS binds to transaction-local GUCs rather than
-- Supabase `auth.uid()`. The invariant the spec actually wants — exactly one
-- owner — is expressed here as `num_nonnulls(...) = 1`, the form already used by
-- learner_mastery and learner_model_events. What this migration fixes is that
-- five Learn tables spelled it out longhand under a `_subject_ck` name, one
-- (learn_topic_profiles) permitted a third both-NULL state, and two carried no
-- owner constraint at all.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DEC-1 · uniform owner XOR
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. learn_topic_profiles: the real bug. The 0096 CHECK had a third arm
-- permitting BOTH institution_id and independent_user_id to be NULL — an
-- ownerless profile that no partial unique index covers and no RLS policy can
-- scope. Such rows are a regenerable profiler cache (source 'generated',
-- rebuilt on the next session start for that topic_key), so they are deleted
-- rather than assigned: there is no owner to assign them to, and nothing
-- references them that a NULL would break (learn_sessions.topic_profile_id is
-- ON DELETE SET NULL). A hand-authored 'human_override' would NOT be
-- regenerable, so an ownerless one aborts the migration instead — none can
-- exist today, because the override write path has never shipped.
DO $$
DECLARE
  orphan_overrides integer;
BEGIN
  SELECT count(*) INTO orphan_overrides
  FROM learn_topic_profiles
  WHERE institution_id IS NULL
    AND independent_user_id IS NULL
    AND source <> 'generated';

  IF orphan_overrides > 0 THEN
    RAISE EXCEPTION
      'learn_topic_profiles has % ownerless non-generated row(s); resolve by hand before applying 0103',
      orphan_overrides;
  END IF;
END $$;

DELETE FROM learn_topic_profiles
WHERE institution_id IS NULL
  AND independent_user_id IS NULL;

ALTER TABLE learn_topic_profiles DROP CONSTRAINT IF EXISTS learn_topic_profiles_owner_ck;
ALTER TABLE learn_topic_profiles ADD CONSTRAINT learn_topic_profiles_owner_ck
  CHECK (num_nonnulls(institution_id, independent_user_id) = 1);

-- 1b. The 0050/0051 longhand `_subject_ck` constraints. Logically identical to
-- num_nonnulls(...) = 1, so no existing row can violate the replacement and the
-- swap can be validated inline. Renamed to `_owner_ck` for one repo-wide name.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'learn_sessions',
    'learning_paths',
    'quick_answers',
    'revision_states',
    'evidence_tags'
  ] LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', tbl, tbl || '_subject_ck');
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', tbl, tbl || '_owner_ck');
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK (num_nonnulls(student_id, independent_user_id) = 1)',
      tbl, tbl || '_owner_ck'
    );
  END LOOP;
END $$;

-- 1c. learn_attempts had NO owner constraint at all (0050:153-164). Its owner
-- columns are ON DELETE CASCADE, so a live attempt always has a live owner —
-- exactly-one is the correct rule. Backfill from the parent session first, then
-- add NOT VALID and VALIDATE separately: NOT VALID guarantees the migration
-- cannot fail on pre-existing debris (attempts whose session was already
-- SET NULL and whose owner was never written), while still binding every future
-- row. The VALIDATE is attempted and downgraded to a NOTICE if such debris
-- exists, so the constraint self-validates on a clean database.
UPDATE learn_attempts a
SET student_id = s.student_id,
    independent_user_id = s.independent_user_id
FROM learn_sessions s
WHERE s.id = a.session_id
  AND a.student_id IS NULL
  AND a.independent_user_id IS NULL;

ALTER TABLE learn_attempts DROP CONSTRAINT IF EXISTS learn_attempts_owner_ck;
ALTER TABLE learn_attempts ADD CONSTRAINT learn_attempts_owner_ck
  CHECK (num_nonnulls(student_id, independent_user_id) = 1) NOT VALID;

DO $$ BEGIN
  ALTER TABLE learn_attempts VALIDATE CONSTRAINT learn_attempts_owner_ck;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'learn_attempts_owner_ck left NOT VALID: ownerless legacy attempts exist (new rows are still constrained)';
END $$;

-- 1d. learn_ai_calls is the one deliberate exception to exactly-one, and it is
-- constrained to at-most-one instead. Its owner FKs are ON DELETE SET NULL (it
-- is an append-only cost ledger that must outlive the learner it billed), so a
-- legitimately ownerless row is reachable by design. What must never happen is
-- BOTH owners set. Same NOT VALID + VALIDATE pattern.
ALTER TABLE learn_ai_calls DROP CONSTRAINT IF EXISTS learn_ai_calls_owner_ck;
ALTER TABLE learn_ai_calls ADD CONSTRAINT learn_ai_calls_owner_ck
  CHECK (num_nonnulls(student_id, independent_user_id) <= 1) NOT VALID;

DO $$ BEGIN
  ALTER TABLE learn_ai_calls VALIDATE CONSTRAINT learn_ai_calls_owner_ck;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'learn_ai_calls_owner_ck left NOT VALID: dual-owner legacy cost rows exist';
END $$;

-- learn_session_blocks, learn_session_events and learning_path_items carry no
-- owner columns by design — ownership is derived through session_id / path_id.
-- learn_topics and concept_atoms are shared curriculum assets with no learner
-- owner. None of them needs an owner CHECK; their RLS is parent-derived.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DEC-5 · learner_mastery.rating default 800 -> 1200
-- ─────────────────────────────────────────────────────────────────────────────
-- Hyperspec §6 displays mastery as m = clamp((r - 800) / 800, 0, 1). A default
-- of 800 renders every brand-new learner as 0.0 mastery instead of the intended
-- 0.5, and makes the first medium-difficulty (1300) attempt expect p ≈ 0.053
-- instead of ≈ 0.360 — which then hands the Elo update a wildly wrong surprise
-- term. 1200 is the spec value.
ALTER TABLE learner_mastery ALTER COLUMN rating SET DEFAULT 1200;

-- Backfill only rows that are still sitting on the untouched default. attempts
-- > 0 means the rating was earned through the Elo update and must not be moved.
UPDATE learner_mastery
SET rating = 1200,
    updated_at = now()
WHERE rating = 800
  AND attempts = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. DEC-11 · Plan-02 leftovers become nullable
-- ─────────────────────────────────────────────────────────────────────────────
-- learn_sessions.spine, learn_sessions.session_plan and
-- learn_session_blocks.spine_step are Plan-02 concepts the orchestrator does not
-- have. It satisfies the NOT NULLs with meaningless stubs ('[]',
-- '{"orchestrator":true}', 'understand') that later readers cannot distinguish
-- from real values. Dropping NOT NULL lets the orchestrator write NULL and mean
-- it. The columns are NOT dropped: the legacy student/learn/ surface is still
-- live and still writes real values into them.
ALTER TABLE learn_sessions ALTER COLUMN spine DROP NOT NULL;
ALTER TABLE learn_sessions ALTER COLUMN session_plan DROP NOT NULL;
ALTER TABLE learn_session_blocks ALTER COLUMN spine_step DROP NOT NULL;
