CREATE TABLE IF NOT EXISTS petros_document_source_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  class_material_id uuid REFERENCES class_materials(id) ON DELETE CASCADE,
  canonical_knowledge_item_id uuid REFERENCES knowledge_items(id) ON DELETE SET NULL,
  source_key text NOT NULL,
  title text NOT NULL,
  mime_type text,
  document_version integer NOT NULL,
  checksum text NOT NULL,
  parser_version text NOT NULL,
  extraction_status text NOT NULL DEFAULT 'ready',
  structure jsonb NOT NULL,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS petros_document_source_revisions_uq ON petros_document_source_revisions (institution_id, source_key, document_version, checksum, parser_version);
CREATE INDEX IF NOT EXISTS petros_document_source_revisions_material_idx ON petros_document_source_revisions (institution_id, class_material_id, created_at);

CREATE TABLE IF NOT EXISTS petros_document_preparations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  source_revision_id uuid NOT NULL REFERENCES petros_document_source_revisions(id) ON DELETE CASCADE,
  requested_concept_id text NOT NULL DEFAULT 'recommended',
  generator_version text NOT NULL,
  curriculum_key text NOT NULL DEFAULT 'default',
  request_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  stage text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  message text NOT NULL DEFAULT 'Petros is preparing the source.',
  document_map jsonb,
  recommended_concept_id text,
  first_lesson_id uuid,
  issue_code text,
  issue_detail text,
  retryable integer NOT NULL DEFAULT 1,
  attempt_count integer NOT NULL DEFAULT 0,
  token_usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  timing jsonb NOT NULL DEFAULT '{}'::jsonb,
  lease_owner text,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS petros_document_preparations_dedupe_uq ON petros_document_preparations (institution_id, source_revision_id, requested_concept_id, generator_version, curriculum_key);
CREATE INDEX IF NOT EXISTS petros_document_preparations_status_idx ON petros_document_preparations (status, updated_at);

CREATE TABLE IF NOT EXISTS petros_document_lesson_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  source_revision_id uuid NOT NULL REFERENCES petros_document_source_revisions(id) ON DELETE CASCADE,
  preparation_id uuid NOT NULL REFERENCES petros_document_preparations(id) ON DELETE CASCADE,
  concept_id text NOT NULL,
  subject text NOT NULL,
  generator_version text NOT NULL,
  status text NOT NULL DEFAULT 'validating',
  public_plan jsonb NOT NULL,
  private_plan jsonb NOT NULL,
  quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS petros_document_lesson_artifacts_concept_uq ON petros_document_lesson_artifacts (institution_id, source_revision_id, concept_id, generator_version);
CREATE INDEX IF NOT EXISTS petros_document_lesson_artifacts_preparation_idx ON petros_document_lesson_artifacts (preparation_id, status);
ALTER TABLE petros_document_preparations DROP CONSTRAINT IF EXISTS petros_document_preparations_first_lesson_id_fkey;
ALTER TABLE petros_document_preparations ADD CONSTRAINT petros_document_preparations_first_lesson_id_fkey FOREIGN KEY (first_lesson_id) REFERENCES petros_document_lesson_artifacts(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS petros_document_learner_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  knowledge_item_id uuid NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  source_revision_id uuid NOT NULL REFERENCES petros_document_source_revisions(id) ON DELETE CASCADE,
  preparation_id uuid NOT NULL REFERENCES petros_document_preparations(id) ON DELETE CASCADE,
  current_concept_id text,
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS petros_document_learner_paths_uq ON petros_document_learner_paths (institution_id, student_id, source_revision_id);
CREATE INDEX IF NOT EXISTS petros_document_learner_paths_learner_idx ON petros_document_learner_paths (institution_id, student_id, updated_at);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'petros_document_source_revisions',
    'petros_document_preparations',
    'petros_document_lesson_artifacts',
    'petros_document_learner_paths'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', table_name || '_institution', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING ((edrion_current_institution() IS NULL) OR institution_id::text = edrion_current_institution()) WITH CHECK ((edrion_current_institution() IS NULL) OR institution_id::text = edrion_current_institution())',
      table_name || '_institution', table_name
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS petros_document_learner_paths_owner ON petros_document_learner_paths;
CREATE POLICY petros_document_learner_paths_owner ON petros_document_learner_paths
  AS RESTRICTIVE FOR ALL
  USING (edrion_current_student() IS NULL OR student_id::text = edrion_current_student())
  WITH CHECK (edrion_current_student() IS NULL OR student_id::text = edrion_current_student());
