-- M0-R PHASE A ONLY: disposable rehearsal; NEVER an automatic migration.
-- Execute atomically through rehearse-petros-v2-readiness-repair.ts.
-- Deployment requires a separately approved migration + role/pool rollout.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
SET LOCAL search_path = pg_catalog, public;
DO $$ BEGIN
  IF to_regclass('pg_temp.petros_m0r_guard') IS NULL THEN
    RAISE EXCEPTION 'M0R_DISPOSABLE_TARGET_REQUIRED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_temp.petros_m0r_guard
    WHERE database_name = current_database()
      AND database_name ~ '^petros_m0r_[a-f0-9]{24}$'
      AND data_directory = current_setting('data_directory')
      AND inet_server_addr() IS NULL) THEN
    RAISE EXCEPTION 'M0R_DISPOSABLE_TARGET_REFUSED';
  END IF;
END $$;
-- Independent of drizzle.__drizzle_migrations: no ledger writes or old hash edits.
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

-- Existing app role stays a non-owner. No passwords/login state are changed here.
ALTER ROLE edrion_app NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND pg_has_role('edrion_app',c.relowner,'MEMBER'))
    OR EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member=(SELECT oid FROM pg_roles WHERE rolname='edrion_app')) THEN
    RAISE EXCEPTION 'M0R_APP_OWNER_OR_MEMBERSHIP_REQUIRES_SEPARATE_RECONCILIATION';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='edrion_petros_document_worker') THEN
    CREATE ROLE edrion_petros_document_worker NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, edrion_app, edrion_petros_document_worker;
GRANT USAGE ON SCHEMA public TO edrion_petros_document_worker;

-- GUCs are set only by trusted server code after principal verification; they are
-- not a defence against arbitrary SQL execution with a stolen application secret.
CREATE OR REPLACE FUNCTION public.edrion_petros_owner(i uuid, s uuid, u uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(
  (i::text=public.edrion_current_institution() AND s::text=public.edrion_current_student()
   AND u IS NULL AND public.edrion_current_independent_user() IS NULL
   AND EXISTS(SELECT 1 FROM public.students st JOIN public.institution_users iu ON iu.id=st.institution_user_id AND iu.institution_id=i
    WHERE st.id=s AND st.institution_id=i AND st.status='enrolled' AND iu.status='active'))
  OR (i IS NULL AND s IS NULL AND u::text=public.edrion_current_independent_user()
   AND public.edrion_current_institution() IS NULL AND public.edrion_current_student() IS NULL),false)
$$;
-- Restrictive policies compose with existing permissive policies; none can OR
-- around the owner predicate. Cover direct-owner Petros tables already installed.
DO $$ DECLARE r record; predicate text; BEGIN
 FOR r IN SELECT c.table_name,
   EXISTS(SELECT 1 FROM information_schema.columns d WHERE d.table_schema='public' AND d.table_name=c.table_name AND d.column_name='independent_user_id') AS independent
   FROM information_schema.columns c WHERE c.table_schema='public' AND c.column_name='student_id'
    AND (c.table_name LIKE 'petros_%' OR c.table_name IN('knowledge_items','knowledge_collections','knowledge_artifacts'))
    AND EXISTS(SELECT 1 FROM information_schema.columns d WHERE d.table_schema='public' AND d.table_name=c.table_name AND d.column_name='institution_id')
 LOOP
  predicate:=format('public.edrion_petros_owner(institution_id,student_id,%s)', CASE WHEN r.independent THEN 'independent_user_id' ELSE 'NULL::uuid' END);
  IF EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname='session_id' AND a.attnum=ANY(c.conkey)
    WHERE c.conrelid=to_regclass('public.'||r.table_name) AND c.confrelid='public.petros_learning_sessions'::regclass AND c.contype='f') THEN
   predicate:=predicate || format(' AND EXISTS(SELECT 1 FROM public.petros_learning_sessions s WHERE s.id=%I.session_id AND s.institution_id=%I.institution_id AND s.student_id=%I.student_id)',r.table_name,r.table_name,r.table_name);
  END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',r.table_name);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',r.table_name);
  EXECUTE format('DROP POLICY IF EXISTS m0r_owner_allow ON public.%I',r.table_name);
  EXECUTE format('DROP POLICY IF EXISTS m0r_owner_guard ON public.%I',r.table_name);
  EXECUTE format('CREATE POLICY m0r_owner_allow ON public.%I FOR ALL TO edrion_app,edrion_petros_document_worker USING (%s) WITH CHECK (%s)',r.table_name,predicate,predicate);
  EXECUTE format('CREATE POLICY m0r_owner_guard ON public.%I AS RESTRICTIVE FOR ALL TO edrion_app,edrion_petros_document_worker USING (%s) WITH CHECK (%s)',r.table_name,predicate,predicate);
 END LOOP;
END $$;
-- Child pages cannot be reached by bypassing the parent owner check.
ALTER TABLE public.knowledge_item_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_item_pages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS m0r_page_allow ON public.knowledge_item_pages;
DROP POLICY IF EXISTS m0r_page_guard ON public.knowledge_item_pages;
CREATE POLICY m0r_page_allow ON public.knowledge_item_pages FOR ALL TO edrion_app,edrion_petros_document_worker
 USING(EXISTS(SELECT 1 FROM public.knowledge_items k WHERE k.id=item_id))
 WITH CHECK(EXISTS(SELECT 1 FROM public.knowledge_items k WHERE k.id=item_id));
CREATE POLICY m0r_page_guard ON public.knowledge_item_pages AS RESTRICTIVE FOR ALL TO edrion_app,edrion_petros_document_worker
 USING(EXISTS(SELECT 1 FROM public.knowledge_items k WHERE k.id=item_id))
 WITH CHECK(EXISTS(SELECT 1 FROM public.knowledge_items k WHERE k.id=item_id));

-- Fail closed for institutional topic configuration and the eight previously
-- non-FORCE tables. More permissive legacy tenant policies cannot bypass this.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['assignments','petros_conversations','petros_messages','petros_artifacts','petros_attachments','petros_pending_turns','petros_decline_stats','petros_topic_profile_overrides','petros_topic_profile_audits'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS m0r_tenant_allow ON public.%I',t);
  EXECUTE format('DROP POLICY IF EXISTS m0r_tenant_guard ON public.%I',t);
  EXECUTE format('CREATE POLICY m0r_tenant_allow ON public.%I FOR ALL TO edrion_app USING (institution_id::text=public.edrion_current_institution()) WITH CHECK (institution_id::text=public.edrion_current_institution())',t);
  EXECUTE format('CREATE POLICY m0r_tenant_guard ON public.%I AS RESTRICTIVE FOR ALL TO edrion_app USING (institution_id::text=public.edrion_current_institution()) WITH CHECK (institution_id::text=public.edrion_current_institution())',t);
 END LOOP;
END $$;
-- Conversations are private to the authenticated institution user as well.
DROP POLICY IF EXISTS m0r_conversation_owner ON public.petros_conversations;
CREATE POLICY m0r_conversation_owner ON public.petros_conversations AS RESTRICTIVE FOR ALL TO edrion_app
 USING(institution_user_id::text=NULLIF(current_setting('app.institution_user_id',true),''))
 WITH CHECK(institution_user_id::text=NULLIF(current_setting('app.institution_user_id',true),''));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['petros_messages','petros_artifacts','petros_attachments','petros_pending_turns'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS m0r_conversation_parent ON public.%I',t);
  EXECUTE format('CREATE POLICY m0r_conversation_parent ON public.%I AS RESTRICTIVE FOR ALL TO edrion_app USING(EXISTS(SELECT 1 FROM public.petros_conversations c WHERE c.id=conversation_id)) WITH CHECK(EXISTS(SELECT 1 FROM public.petros_conversations c WHERE c.id=conversation_id))',t);
 END LOOP;
END $$;
ALTER TABLE public.assignment_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_assignees FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS m0r_assignees ON public.assignment_assignees;
CREATE POLICY m0r_assignees ON public.assignment_assignees FOR ALL TO edrion_app
 USING(EXISTS(SELECT 1 FROM public.assignments a WHERE a.id=assignment_id)
   AND (student_id::text=public.edrion_current_student() OR
    (public.edrion_current_student() IS NULL AND public.edrion_current_institution() IS NOT NULL AND public.edrion_current_independent_user() IS NULL)))
 WITH CHECK(EXISTS(SELECT 1 FROM public.assignments a WHERE a.id=assignment_id)
   AND (student_id::text=public.edrion_current_student() OR
    (public.edrion_current_student() IS NULL AND public.edrion_current_institution() IS NOT NULL AND public.edrion_current_independent_user() IS NULL)));

-- Storage retains legitimate class/course material reads, without granting all
-- institutional students access to each other's personal objects.
CREATE OR REPLACE FUNCTION public.edrion_petros_material_visible(m uuid, i uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.class_materials cm WHERE cm.id=m AND cm.institution_id=i
  AND i::text=public.edrion_current_institution() AND
  ((cm.context_type='class' AND EXISTS(SELECT 1 FROM public.students s WHERE s.id::text=public.edrion_current_student() AND s.institution_id=i AND s.class_id=cm.context_id))
   OR (cm.context_type='course' AND EXISTS(SELECT 1 FROM public.course_enrollments e JOIN public.courses c ON c.id=e.course_id
    WHERE e.student_id::text=public.edrion_current_student() AND e.institution_id=i AND c.institution_id=i AND c.status='active' AND c.id=cm.context_id))))
$$;
CREATE OR REPLACE FUNCTION public.edrion_petros_guidance_file_visible(o uuid,i uuid,b jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.assignments a JOIN public.assignment_assignees s ON s.assignment_id=a.id
  WHERE a.institution_id=i AND a.status='published' AND s.student_id::text=public.edrion_current_student()
   AND COALESCE(a.petros_guidance->'attachmentObjectIds','[]'::jsonb) @> jsonb_build_array(o::text)
   AND b->>'classId'=a.class_id::text AND b->>'subjectId'=a.subject_id::text)
$$;
ALTER TABLE public.storage_objects FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS m0r_storage_guard ON public.storage_objects;
CREATE POLICY m0r_storage_guard ON public.storage_objects AS RESTRICTIVE FOR ALL TO edrion_app,edrion_petros_document_worker
 USING(public.edrion_petros_owner(institution_id,owner_student_id,owner_independent_user_id)
  OR (institution_id::text=public.edrion_current_institution() AND public.edrion_current_student() IS NULL AND public.edrion_current_independent_user() IS NULL)
  OR EXISTS(SELECT 1 FROM public.class_materials cm WHERE cm.object_id=storage_objects.id AND public.edrion_petros_material_visible(cm.id,storage_objects.institution_id))
  OR (current_user='edrion_app' AND kind='petros_guidance_attachment' AND processing_status='ready'
   AND public.edrion_petros_guidance_file_visible(id,institution_id,derived->'guidanceBinding')))
 WITH CHECK(public.edrion_petros_owner(institution_id,owner_student_id,owner_independent_user_id)
  OR (institution_id::text=public.edrion_current_institution() AND public.edrion_current_student() IS NULL AND public.edrion_current_independent_user() IS NULL));
-- Worker grants are explicit, never ALL TABLES and never qualification writes.
GRANT SELECT ON public.students,public.knowledge_items,public.knowledge_item_pages,public.storage_objects,public.class_materials,public.courses,public.course_enrollments TO edrion_petros_document_worker;
GRANT SELECT(id,institution_id,status) ON public.institution_users TO edrion_petros_document_worker;
GRANT SELECT(item_id,ordinal,state,invalidated_at,admissible) ON public.knowledge_item_versions TO edrion_petros_document_worker;
DROP POLICY IF EXISTS m0r_worker_storage ON public.storage_objects;
CREATE POLICY m0r_worker_storage ON public.storage_objects FOR SELECT TO edrion_petros_document_worker
 USING(public.edrion_petros_owner(institution_id,owner_student_id,owner_independent_user_id)
 OR EXISTS(SELECT 1 FROM public.class_materials cm WHERE cm.object_id=storage_objects.id AND public.edrion_petros_material_visible(cm.id,storage_objects.institution_id)));

-- Source access rechecks current ownership, revocation, object availability,
-- material membership and the exact extracted page checksum on every operation.
CREATE OR REPLACE FUNCTION public.edrion_petros_document_live(i uuid, k_id uuid, m uuid, v integer, h text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.knowledge_items k
  WHERE k.institution_id=i AND k.source_revoked_at IS NULL AND k.status='ready' AND k.version=v
   AND NOT EXISTS(SELECT 1 FROM public.knowledge_item_versions kv WHERE kv.item_id=k.id AND kv.ordinal=k.version AND (kv.invalidated_at IS NOT NULL OR kv.state<>'complete' OR NOT kv.admissible))
   AND (k.id=k_id OR (m IS NOT NULL AND k.origin->>'classMaterialId'=m::text))
   AND (m IS NULL OR public.edrion_petros_material_visible(m,i))
   AND jsonb_array_length(k.object_ids)=1
   AND EXISTS(SELECT 1 FROM public.storage_objects o WHERE o.id::text=k.object_ids->>0 AND o.institution_id=i
    AND o.processing_status IN('uploaded','ready')
    AND (k.origin->'petrosExtraction'->>'fileSha256' IS NULL OR k.origin->'petrosExtraction'->>'fileSha256'=o.checksum_sha256)
    AND (m IS NULL OR EXISTS(SELECT 1 FROM public.class_materials cm WHERE cm.id=m AND cm.object_id=o.id)))
   AND (SELECT encode(sha256(convert_to(string_agg(p.page_index::text || ':' || p.text,E'\n' ORDER BY p.page_index),'UTF8')),'hex')
     FROM public.knowledge_item_pages p WHERE p.item_id=k.id)=h)
$$;
-- Replace permissive legacy document policies with explicit source/owner scopes.
DO $$ DECLARE t text; p record; predicate text; BEGIN
 FOREACH t IN ARRAY ARRAY['petros_document_source_revisions','petros_document_preparations','petros_document_lesson_artifacts','petros_document_learner_paths'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
  END LOOP;
  IF t='petros_document_source_revisions' THEN
   predicate:='public.edrion_petros_document_live(institution_id,canonical_knowledge_item_id,class_material_id,document_version,checksum)';
  ELSE
   predicate:='EXISTS(SELECT 1 FROM public.petros_document_source_revisions r WHERE r.id=source_revision_id AND r.institution_id=' || quote_ident(t) || '.institution_id)';
   IF t='petros_document_learner_paths' THEN
    predicate:=predicate || ' AND public.edrion_petros_owner(institution_id,student_id) AND EXISTS(SELECT 1 FROM public.knowledge_items k WHERE k.id=knowledge_item_id AND k.student_id=petros_document_learner_paths.student_id AND k.institution_id=petros_document_learner_paths.institution_id AND k.source_revoked_at IS NULL)';
   END IF;
  END IF;
  EXECUTE format('CREATE POLICY m0r_document_scope ON public.%I FOR ALL TO edrion_app,edrion_petros_document_worker USING(%s) WITH CHECK(%s)',t,predicate,predicate);
 END LOOP;
END $$;
-- The worker must resolve a live owner path and set its trusted preparation ID.
DROP POLICY IF EXISTS m0r_worker_preparation ON public.petros_document_preparations;
CREATE POLICY m0r_worker_preparation ON public.petros_document_preparations AS RESTRICTIVE FOR ALL TO edrion_petros_document_worker
 USING(id::text=NULLIF(current_setting('app.preparation_id',true),'') AND EXISTS(
  SELECT 1 FROM public.petros_document_learner_paths p WHERE p.preparation_id=petros_document_preparations.id AND p.status='active'))
 WITH CHECK(id::text=NULLIF(current_setting('app.preparation_id',true),'') AND EXISTS(
  SELECT 1 FROM public.petros_document_learner_paths p WHERE p.preparation_id=petros_document_preparations.id AND p.status='active'));
DROP POLICY IF EXISTS m0r_worker_artifact ON public.petros_document_lesson_artifacts;
CREATE POLICY m0r_worker_artifact ON public.petros_document_lesson_artifacts AS RESTRICTIVE FOR ALL TO edrion_petros_document_worker
 USING(preparation_id::text=NULLIF(current_setting('app.preparation_id',true),''))
 WITH CHECK(preparation_id::text=NULLIF(current_setting('app.preparation_id',true),''));

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
REVOKE ALL ON public.petros_document_source_revisions,public.petros_document_preparations,public.petros_document_lesson_artifacts,public.petros_document_learner_paths FROM PUBLIC,edrion_app,edrion_petros_document_worker;
GRANT SELECT,INSERT ON public.petros_document_source_revisions TO edrion_app;
GRANT SELECT,INSERT,UPDATE ON public.petros_document_preparations,public.petros_document_learner_paths TO edrion_app;
-- Application services currently select whole artifact rows. Column privacy needs
-- a reviewed public projection before activation; do not expose private_plan.
GRANT SELECT(id,institution_id,source_revision_id,preparation_id,concept_id,subject,generator_version,status,public_plan,quality,provenance,published_at,created_at,updated_at) ON public.petros_document_lesson_artifacts TO edrion_app;
GRANT SELECT ON public.petros_document_source_revisions,public.petros_document_preparations,public.petros_document_learner_paths TO edrion_petros_document_worker;
GRANT SELECT,INSERT,UPDATE ON public.petros_document_lesson_artifacts TO edrion_petros_document_worker;
GRANT UPDATE(status,stage,progress,message,document_map,recommended_concept_id,first_lesson_id,issue_code,issue_detail,retryable,attempt_count,token_usage,timing,lease_owner,lease_expires_at,started_at,completed_at,updated_at) ON public.petros_document_preparations TO edrion_petros_document_worker;
-- Immutable contents remain protected even if old broad grants are replayed.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['petros_document_source_revisions','petros_planning_decisions','petros_observations','petros_session_events','petros_learner_plan_snapshots','petros_ai_usage_events'] LOOP
  EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE ON public.%I FROM edrion_app,edrion_petros_document_worker',t);
  EXECUTE format('DROP TRIGGER IF EXISTS m0r_history_immutable ON public.%I',t);
  EXECUTE format('CREATE TRIGGER m0r_history_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.edrion_block_mutation()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS m0r_history_no_truncate ON public.%I',t);
  EXECUTE format('CREATE TRIGGER m0r_history_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.edrion_block_mutation()',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.edrion_petros_owner(uuid,uuid,uuid),public.edrion_petros_material_visible(uuid,uuid),public.edrion_petros_document_live(uuid,uuid,uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edrion_petros_owner(uuid,uuid,uuid),public.edrion_petros_material_visible(uuid,uuid),public.edrion_petros_document_live(uuid,uuid,uuid,integer,text) TO edrion_app,edrion_petros_document_worker;
REVOKE ALL ON FUNCTION public.edrion_petros_guidance_file_visible(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edrion_petros_guidance_file_visible(uuid,uuid,jsonb) TO edrion_app,edrion_petros_document_worker;

-- Existing names are not evidence of equivalent indexes. Abort atomically on
-- a conflicting partial install; do not silently keep or replace its objects.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('petros_document_source_revisions','petros_document_source_revisions_uq','CREATE UNIQUE INDEX petros_document_source_revisions_uq ON public.petros_document_source_revisions USING btree (institution_id, source_key, document_version, checksum, parser_version)'),
  ('petros_document_source_revisions','petros_document_source_revisions_material_idx','CREATE INDEX petros_document_source_revisions_material_idx ON public.petros_document_source_revisions USING btree (institution_id, class_material_id, created_at)'),
  ('petros_document_preparations','petros_document_preparations_dedupe_uq','CREATE UNIQUE INDEX petros_document_preparations_dedupe_uq ON public.petros_document_preparations USING btree (institution_id, source_revision_id, requested_concept_id, generator_version, curriculum_key)'),
  ('petros_document_preparations','petros_document_preparations_status_idx','CREATE INDEX petros_document_preparations_status_idx ON public.petros_document_preparations USING btree (status, updated_at)'),
  ('petros_document_lesson_artifacts','petros_document_lesson_artifacts_concept_uq','CREATE UNIQUE INDEX petros_document_lesson_artifacts_concept_uq ON public.petros_document_lesson_artifacts USING btree (institution_id, source_revision_id, concept_id, generator_version)'),
  ('petros_document_lesson_artifacts','petros_document_lesson_artifacts_preparation_idx','CREATE INDEX petros_document_lesson_artifacts_preparation_idx ON public.petros_document_lesson_artifacts USING btree (preparation_id, status)'),
  ('petros_document_learner_paths','petros_document_learner_paths_uq','CREATE UNIQUE INDEX petros_document_learner_paths_uq ON public.petros_document_learner_paths USING btree (institution_id, student_id, source_revision_id)'),
  ('petros_document_learner_paths','petros_document_learner_paths_learner_idx','CREATE INDEX petros_document_learner_paths_learner_idx ON public.petros_document_learner_paths USING btree (institution_id, student_id, updated_at)')) AS expected(table_name,index_name,definition) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_indexes x WHERE x.schemaname='public' AND x.tablename=r.table_name
    AND x.indexname=r.index_name AND x.indexdef=r.definition) THEN
   RAISE EXCEPTION 'M0R_DOCUMENT_INDEX_DRIFT_REQUIRES_REVIEW';
  END IF;
 END LOOP;
END $$;
