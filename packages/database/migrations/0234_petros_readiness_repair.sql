-- PROPOSED ONLY. Requires separate staging/production approval.
-- Historical exceptions are accounted in the M0-R dossier; no old ledger rewrites.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';
ALTER TABLE public.petros_document_lesson_outlines ADD COLUMN IF NOT EXISTS lesson_plan jsonb;
CREATE TABLE IF NOT EXISTS public.petros_document_source_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  class_material_id uuid REFERENCES class_materials(id) ON DELETE RESTRICT,
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

CREATE TABLE IF NOT EXISTS public.petros_document_preparations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  source_revision_id uuid NOT NULL REFERENCES petros_document_source_revisions(id) ON DELETE RESTRICT,
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

CREATE TABLE IF NOT EXISTS public.petros_document_lesson_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  source_revision_id uuid NOT NULL REFERENCES petros_document_source_revisions(id) ON DELETE RESTRICT,
  preparation_id uuid NOT NULL REFERENCES petros_document_preparations(id) ON DELETE RESTRICT,
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

CREATE TABLE IF NOT EXISTS public.petros_document_learner_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  knowledge_item_id uuid NOT NULL REFERENCES knowledge_items(id) ON DELETE RESTRICT,
  source_revision_id uuid NOT NULL REFERENCES petros_document_source_revisions(id) ON DELETE RESTRICT,
  preparation_id uuid NOT NULL REFERENCES petros_document_preparations(id) ON DELETE RESTRICT,
  current_concept_id text,
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS petros_document_learner_paths_uq ON petros_document_learner_paths (institution_id, student_id, source_revision_id);
CREATE INDEX IF NOT EXISTS petros_document_learner_paths_learner_idx ON petros_document_learner_paths (institution_id, student_id, updated_at);

-- Cross-tenant/source relationships must also hold for the DDL owner/admin.
-- New composite keys only; no existing source/answer/mark rewrites.
CREATE UNIQUE INDEX IF NOT EXISTS m0r_revision_tenant_uq ON public.petros_document_source_revisions(id,institution_id);
CREATE UNIQUE INDEX IF NOT EXISTS m0r_preparation_source_uq ON public.petros_document_preparations(id,institution_id,source_revision_id);
CREATE UNIQUE INDEX IF NOT EXISTS m0r_artifact_source_uq ON public.petros_document_lesson_artifacts(id,institution_id,source_revision_id,preparation_id);
CREATE UNIQUE INDEX IF NOT EXISTS m0r_knowledge_owner_uq ON public.knowledge_items(id,institution_id,student_id);
CREATE UNIQUE INDEX IF NOT EXISTS m0r_material_tenant_uq ON public.class_materials(id,institution_id);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.petros_document_preparations'::regclass AND conname='m0r_preparation_revision_fk') THEN
  ALTER TABLE public.petros_document_source_revisions ADD CONSTRAINT m0r_source_canonical_tenant_fk FOREIGN KEY(canonical_knowledge_item_id,institution_id) REFERENCES public.knowledge_items(id,institution_id);
  ALTER TABLE public.petros_document_source_revisions ADD CONSTRAINT m0r_source_material_tenant_fk FOREIGN KEY(class_material_id,institution_id) REFERENCES public.class_materials(id,institution_id);
  ALTER TABLE public.petros_document_learner_paths ADD CONSTRAINT m0r_path_student_tenant_fk FOREIGN KEY(student_id,institution_id) REFERENCES public.students(id,institution_id);
  ALTER TABLE public.petros_document_learner_paths ADD CONSTRAINT m0r_path_knowledge_owner_fk FOREIGN KEY(knowledge_item_id,institution_id,student_id) REFERENCES public.knowledge_items(id,institution_id,student_id);
  ALTER TABLE public.petros_document_preparations ADD CONSTRAINT m0r_preparation_revision_fk FOREIGN KEY(source_revision_id,institution_id) REFERENCES public.petros_document_source_revisions(id,institution_id);
  ALTER TABLE public.petros_document_lesson_artifacts ADD CONSTRAINT m0r_artifact_preparation_fk FOREIGN KEY(preparation_id,institution_id,source_revision_id) REFERENCES public.petros_document_preparations(id,institution_id,source_revision_id);
  ALTER TABLE public.petros_document_learner_paths ADD CONSTRAINT m0r_path_preparation_fk FOREIGN KEY(preparation_id,institution_id,source_revision_id) REFERENCES public.petros_document_preparations(id,institution_id,source_revision_id);
  ALTER TABLE public.petros_document_preparations ADD CONSTRAINT m0r_first_lesson_source_fk FOREIGN KEY(first_lesson_id,institution_id,source_revision_id,id) REFERENCES public.petros_document_lesson_artifacts(id,institution_id,source_revision_id,preparation_id) DEFERRABLE INITIALLY DEFERRED;
  ALTER TABLE public.petros_document_source_revisions ADD CONSTRAINT m0r_source_version_check CHECK(document_version>0 AND checksum ~ '^[a-f0-9]{64}$');
  ALTER TABLE public.petros_document_source_revisions ADD CONSTRAINT m0r_source_key_check CHECK((class_material_id IS NOT NULL AND source_key='material:'||class_material_id::text) OR (class_material_id IS NULL AND canonical_knowledge_item_id IS NOT NULL AND source_key='knowledge:'||canonical_knowledge_item_id::text));
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.edrion_petros_published_document_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Document history cannot be erased'; END IF;
 IF OLD.status='published' AND (to_jsonb(NEW)-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at') THEN
  RAISE EXCEPTION 'Published document lesson is immutable; create a new generator revision';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS m0r_published_document_immutable ON public.petros_document_lesson_artifacts;
CREATE TRIGGER m0r_published_document_immutable BEFORE UPDATE OR DELETE ON public.petros_document_lesson_artifacts FOR EACH ROW EXECUTE FUNCTION public.edrion_petros_published_document_immutable();
DROP TRIGGER IF EXISTS m0r_published_document_no_truncate ON public.petros_document_lesson_artifacts;
CREATE TRIGGER m0r_published_document_no_truncate BEFORE TRUNCATE ON public.petros_document_lesson_artifacts FOR EACH STATEMENT EXECUTE FUNCTION public.edrion_petros_published_document_immutable();
