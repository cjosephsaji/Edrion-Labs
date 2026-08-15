-- Petros Stage 4: canonical topic profiles, immutable versions, institution overlays, and full moves.

CREATE TABLE IF NOT EXISTS petros_topic_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learn_topic_id uuid REFERENCES learn_topics(id) ON DELETE SET NULL,
  topic_key text NOT NULL,
  canonical_title text NOT NULL,
  subject_key text NOT NULL,
  subject_label text NOT NULL,
  grade_band text NOT NULL,
  curriculum_key text NOT NULL,
  curriculum_label text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  published_version_id uuid,
  cache_key text NOT NULL,
  cache_version integer NOT NULL DEFAULT 1,
  cache_hit_count integer NOT NULL DEFAULT 0,
  invalidation_inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  stale_reason text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_topic_profiles_status_ck CHECK (status IN ('draft', 'published', 'stale', 'archived')),
  CONSTRAINT petros_topic_profiles_version_ck CHECK (version > 0 AND cache_version > 0),
  CONSTRAINT petros_topic_profiles_identity_uniq UNIQUE (topic_key, curriculum_key, grade_band),
  CONSTRAINT petros_topic_profiles_cache_key_uniq UNIQUE (cache_key)
);
CREATE INDEX IF NOT EXISTS petros_topic_profiles_filter_idx
  ON petros_topic_profiles (status, subject_key, curriculum_key, grade_band);

CREATE TABLE IF NOT EXISTS petros_topic_profile_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES petros_topic_profiles(id) ON DELETE CASCADE,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  source text NOT NULL,
  profile jsonb NOT NULL,
  profile_hash text NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_basis_points integer NOT NULL,
  generator_version text NOT NULL,
  prompt_version text NOT NULL,
  schema_version text NOT NULL,
  based_on_version integer,
  change_summary text NOT NULL,
  generated_request_id uuid,
  route_reference jsonb,
  created_by text,
  reviewed_by text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_topic_profile_versions_status_ck CHECK (status IN ('draft', 'published', 'superseded', 'rolled_back')),
  CONSTRAINT petros_topic_profile_versions_source_ck CHECK (source IN ('generated', 'human_edit', 'rollback')),
  CONSTRAINT petros_topic_profile_versions_confidence_ck CHECK (confidence_basis_points BETWEEN 0 AND 10000),
  CONSTRAINT petros_topic_profile_versions_version_ck CHECK (version > 0),
  CONSTRAINT petros_topic_profile_versions_version_uniq UNIQUE (profile_id, version)
);
CREATE INDEX IF NOT EXISTS petros_topic_profile_versions_status_idx
  ON petros_topic_profile_versions (profile_id, status, created_at);

ALTER TABLE petros_topic_profiles
  ADD CONSTRAINT petros_topic_profiles_published_version_fk
  FOREIGN KEY (published_version_id) REFERENCES petros_topic_profile_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS petros_topic_profile_prerequisites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_version_id uuid NOT NULL REFERENCES petros_topic_profile_versions(id) ON DELETE CASCADE,
  concept_key text NOT NULL,
  label text NOT NULL,
  requiredness text NOT NULL,
  source_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  sequence integer NOT NULL,
  CONSTRAINT petros_topic_profile_prerequisites_requiredness_ck CHECK (requiredness IN ('helpful', 'strong', 'mandatory')),
  CONSTRAINT petros_topic_profile_prerequisites_uniq UNIQUE (profile_version_id, concept_key)
);
CREATE INDEX IF NOT EXISTS petros_topic_profile_prerequisites_concept_idx
  ON petros_topic_profile_prerequisites (concept_key);

CREATE TABLE IF NOT EXISTS petros_topic_profile_misconceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_version_id uuid NOT NULL REFERENCES petros_topic_profile_versions(id) ON DELETE CASCADE,
  misconception_key text NOT NULL,
  summary text NOT NULL,
  correction_anchor text NOT NULL,
  source_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  sequence integer NOT NULL,
  CONSTRAINT petros_topic_profile_misconceptions_uniq UNIQUE (profile_version_id, misconception_key)
);
CREATE INDEX IF NOT EXISTS petros_topic_profile_misconceptions_key_idx
  ON petros_topic_profile_misconceptions (misconception_key);

CREATE TABLE IF NOT EXISTS petros_topic_profile_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES petros_topic_profiles(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  patch jsonb NOT NULL,
  based_on_canonical_version integer NOT NULL,
  change_summary text NOT NULL,
  created_by text,
  reviewed_by text,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petros_topic_profile_overrides_status_ck CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT petros_topic_profile_overrides_version_ck CHECK (version > 0 AND based_on_canonical_version > 0),
  CONSTRAINT petros_topic_profile_overrides_version_uniq UNIQUE (profile_id, institution_id, version)
);
CREATE INDEX IF NOT EXISTS petros_topic_profile_overrides_resolution_idx
  ON petros_topic_profile_overrides (institution_id, profile_id, status, version DESC);
CREATE UNIQUE INDEX IF NOT EXISTS petros_topic_profile_overrides_published_uniq
  ON petros_topic_profile_overrides (institution_id, profile_id) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS petros_topic_profile_invalidations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES petros_topic_profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  previous_inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  regenerated boolean NOT NULL DEFAULT false,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS petros_topic_profile_invalidations_profile_idx
  ON petros_topic_profile_invalidations (profile_id, created_at);

CREATE TABLE IF NOT EXISTS petros_topic_profile_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES petros_topic_profiles(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  action text NOT NULL,
  actor_ref text,
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS petros_topic_profile_audits_profile_idx
  ON petros_topic_profile_audits (profile_id, created_at);
CREATE INDEX IF NOT EXISTS petros_topic_profile_audits_institution_idx
  ON petros_topic_profile_audits (institution_id, created_at);

ALTER TABLE petros_learning_sessions
  ADD COLUMN IF NOT EXISTS topic_profile_id uuid REFERENCES petros_topic_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS topic_profile_version_id uuid REFERENCES petros_topic_profile_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_topic_profile jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE petros_planning_decisions
  ADD COLUMN IF NOT EXISTS selection_policy jsonb NOT NULL DEFAULT '{"normalizedCandidateWeights":{},"exclusions":[],"selectedWeight":0,"override":null,"capabilityFallback":null}'::jsonb;

ALTER TABLE petros_planning_decisions DROP CONSTRAINT IF EXISTS petros_planning_decisions_move_ck;
ALTER TABLE petros_planning_decisions ADD CONSTRAINT petros_planning_decisions_move_ck CHECK (
  selected_move_type IN (
    'hook','prerequisite_check','goal_frame','layered_explanation','worked_example','analogy',
    'story','derivation','diagram','predict_then_reveal','contrast_case',
    'misconception_demolition','socratic_probe','recall_check','apply_to_your_world',
    'synthesis','artifact_commit','forward_link'
  )
);

ALTER TABLE petros_teaching_blocks DROP CONSTRAINT IF EXISTS petros_teaching_blocks_type_ck;
ALTER TABLE petros_teaching_blocks ADD CONSTRAINT petros_teaching_blocks_type_ck CHECK (
  type IN (
    'hook','prerequisite_check','goal_frame','layered_explanation','worked_example','analogy',
    'story','derivation','diagram','predict_then_reveal','contrast_case',
    'misconception_demolition','socratic_probe','recall_check','apply_to_your_world',
    'synthesis','artifact_commit','forward_link'
  )
);

-- Existing Stage 2/3 sessions are upgraded lazily on first read so they receive a real published
-- resolved profile instead of a synthetic empty JSON value.
