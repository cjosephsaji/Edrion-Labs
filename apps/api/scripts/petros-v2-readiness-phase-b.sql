-- Phase B candidate overlay. Used only after Phase A repair in a disposable
-- marked transaction; copied into the proposed final grants/RLS replay for review.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_temp.petros_m0r_guard
   WHERE database_name=current_database() AND data_directory=current_setting('data_directory'))
   OR current_database() !~ '^petros_m0r_[a-f0-9]{24}$' OR inet_server_addr() IS NOT NULL THEN
  RAISE EXCEPTION 'M0R_DISPOSABLE_TARGET_REFUSED';
 END IF;
END $$;

-- BEGIN PHASE B DEPLOYMENT OVERLAY (the guard above is rehearsal-only).
-- BEGIN PHASE B CONSTRAINT PREFLIGHT
-- Phase A creates the composite constraints as one group. A partial prior
-- install must abort, rather than letting its sentinel hide missing protection.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('petros_document_source_revisions','m0r_source_canonical_tenant_fk','knowledge_items',ARRAY['canonical_knowledge_item_id','institution_id'],ARRAY['id','institution_id'],false),
  ('petros_document_source_revisions','m0r_source_material_tenant_fk','class_materials',ARRAY['class_material_id','institution_id'],ARRAY['id','institution_id'],false),
  ('petros_document_learner_paths','m0r_path_student_tenant_fk','students',ARRAY['student_id','institution_id'],ARRAY['id','institution_id'],false),
  ('petros_document_learner_paths','m0r_path_knowledge_owner_fk','knowledge_items',ARRAY['knowledge_item_id','institution_id','student_id'],ARRAY['id','institution_id','student_id'],false),
  ('petros_document_preparations','m0r_preparation_revision_fk','petros_document_source_revisions',ARRAY['source_revision_id','institution_id'],ARRAY['id','institution_id'],false),
  ('petros_document_lesson_artifacts','m0r_artifact_preparation_fk','petros_document_preparations',ARRAY['preparation_id','institution_id','source_revision_id'],ARRAY['id','institution_id','source_revision_id'],false),
  ('petros_document_learner_paths','m0r_path_preparation_fk','petros_document_preparations',ARRAY['preparation_id','institution_id','source_revision_id'],ARRAY['id','institution_id','source_revision_id'],false),
  ('petros_document_preparations','m0r_first_lesson_source_fk','petros_document_lesson_artifacts',ARRAY['first_lesson_id','institution_id','source_revision_id','id'],ARRAY['id','institution_id','source_revision_id','preparation_id'],true)
 ) AS expected(child,name,parent,child_columns,parent_columns,deferred) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass('public.'||r.child)
    AND c.conname=r.name AND c.contype='f' AND c.confrelid=to_regclass('public.'||r.parent) AND c.convalidated
    AND c.confdeltype='a' AND c.confupdtype='a' AND c.condeferrable=r.deferred AND c.condeferred=r.deferred
    AND (SELECT array_agg(a.attname::text ORDER BY k.ordinality) FROM unnest(c.conkey) WITH ORDINALITY k(attnum,ordinality)
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum)=r.child_columns
    AND (SELECT array_agg(a.attname::text ORDER BY k.ordinality) FROM unnest(c.confkey) WITH ORDINALITY k(attnum,ordinality)
      JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum)=r.parent_columns) THEN
   RAISE EXCEPTION 'M0R_DOCUMENT_CONSTRAINT_DRIFT_REQUIRES_REVIEW';
  END IF;
 END LOOP;
END $$;
-- END PHASE B CONSTRAINT PREFLIGHT
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='edrion_petros_document_evaluator') THEN
  CREATE ROLE edrion_petros_document_evaluator NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
 END IF;
END $$;
ALTER ROLE edrion_petros_document_worker NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['edrion_petros_document_worker','edrion_petros_document_evaluator'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
    OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=r))
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND pg_has_role(r,c.relowner,'MEMBER')) THEN
   RAISE EXCEPTION 'M0R_DOCUMENT_ROLE_REQUIRES_RECONCILIATION';
  END IF;
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA public FROM edrion_petros_document_evaluator;
-- Dedicated identities cannot retain unrelated grants from an earlier install.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM edrion_petros_document_worker,edrion_petros_document_evaluator;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM edrion_petros_document_worker,edrion_petros_document_evaluator;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT USAGE ON SCHEMA public TO edrion_petros_document_evaluator;
GRANT EXECUTE ON FUNCTION public.edrion_petros_owner(uuid,uuid,uuid),public.edrion_petros_material_visible(uuid,uuid),public.edrion_petros_document_live(uuid,uuid,uuid,integer,text) TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT EXECUTE ON FUNCTION public.edrion_petros_guidance_file_visible(uuid,uuid,jsonb) TO edrion_petros_document_worker;
GRANT SELECT ON public.knowledge_items TO edrion_petros_document_worker;
GRANT SELECT(id,institution_id,student_id,independent_user_id,status,source_revoked_at,version,origin,object_ids) ON public.knowledge_items TO edrion_petros_document_evaluator;
GRANT SELECT(id,institution_id,institution_user_id,status,class_id) ON public.students TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT SELECT(item_id,page_index,text) ON public.knowledge_item_pages TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT SELECT(id,institution_id,owner_student_id,owner_independent_user_id,processing_status,checksum_sha256) ON public.storage_objects TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT SELECT(id,institution_id,context_type,context_id,subject_id,object_id,version) ON public.class_materials TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT SELECT(id,institution_id,status) ON public.courses TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT SELECT(id,institution_id,student_id,course_id) ON public.course_enrollments TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT SELECT(id,institution_id,status,disabled_at,password_reset_required_at) ON public.institution_users TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT SELECT(id,institution_user_id,role_key) ON public.institution_user_roles TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT SELECT(item_id,ordinal,state,invalidated_at,admissible,fingerprint) ON public.knowledge_item_versions TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT SELECT ON public.petros_document_source_revisions,public.petros_document_preparations,public.petros_document_learner_paths TO edrion_petros_document_worker;
GRANT SELECT,INSERT ON public.petros_document_lesson_artifacts TO edrion_petros_document_worker;
GRANT UPDATE(status,stage,progress,message,document_map,recommended_concept_id,first_lesson_id,issue_code,issue_detail,retryable,attempt_count,token_usage,timing,lease_owner,lease_expires_at,started_at,completed_at,updated_at) ON public.petros_document_preparations TO edrion_petros_document_worker;
GRANT SELECT(id,institution_id,student_id,status,version,learner_context,source_context) ON public.petros_learning_sessions TO edrion_petros_document_evaluator;
GRANT SELECT ON public.petros_document_source_revisions,public.petros_document_learner_paths TO edrion_petros_document_evaluator;
GRANT SELECT(id,institution_id,status,source_revision_id,private_plan) ON public.petros_document_lesson_artifacts TO edrion_petros_document_evaluator;

GRANT SELECT(id) ON public.knowledge_item_versions TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT SELECT ON public.knowledge_item_version_pages TO edrion_petros_document_worker,edrion_petros_document_evaluator;

-- Authority metadata must also fail closed on dedicated pools without job scope.
-- The ordinary login's existing identity/role lookup remains available for auth.
DO $$ DECLARE t text; predicate text; BEGIN
 FOREACH t IN ARRAY ARRAY['students','institution_users','storage_objects','class_materials','courses','course_enrollments'] LOOP
  predicate:='institution_id::text=public.edrion_current_institution() AND public.edrion_current_student() IS NOT NULL';
  IF t='students' THEN predicate:=predicate||' AND id::text=public.edrion_current_student()'; END IF;
  IF t='course_enrollments' THEN predicate:=predicate||' AND student_id::text=public.edrion_current_student()'; END IF;
  IF t='institution_users' THEN predicate:=predicate||' AND EXISTS(SELECT 1 FROM public.students st WHERE st.institution_user_id=institution_users.id)'; END IF;
  EXECUTE format('DROP POLICY IF EXISTS m0r_document_authority_guard ON public.%I',t);
  EXECUTE format('CREATE POLICY m0r_document_authority_guard ON public.%I AS RESTRICTIVE FOR ALL TO edrion_petros_document_worker,edrion_petros_document_evaluator USING (%s) WITH CHECK (false)',t,predicate);
 END LOOP;
END $$;
ALTER TABLE public.institution_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institution_user_roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS m0r_application_roles ON public.institution_user_roles;
CREATE POLICY m0r_application_roles ON public.institution_user_roles FOR ALL TO edrion_app USING(true) WITH CHECK(true);
DROP POLICY IF EXISTS m0r_document_roles ON public.institution_user_roles;
CREATE POLICY m0r_document_roles ON public.institution_user_roles FOR ALL TO edrion_petros_document_worker,edrion_petros_document_evaluator
 USING(EXISTS(SELECT 1 FROM public.students st WHERE st.institution_user_id=institution_user_roles.institution_user_id)) WITH CHECK(false);

-- Pre-session intents and content-free failure receipts have nullable session
-- links. Their owner must still be current; non-null links must match that owner.
DO $$ DECLARE r record; predicate text; BEGIN
 FOR r IN SELECT c.table_name FROM information_schema.columns c
  WHERE c.table_schema='public' AND c.column_name='session_id' AND c.is_nullable='YES'
    AND c.table_name LIKE 'petros_%'
    AND EXISTS(SELECT 1 FROM information_schema.columns x WHERE x.table_schema='public' AND x.table_name=c.table_name AND x.column_name='student_id')
    AND EXISTS(SELECT 1 FROM pg_constraint f JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attname='session_id' AND a.attnum=ANY(f.conkey)
      WHERE f.conrelid=to_regclass('public.'||c.table_name) AND f.confrelid='public.petros_learning_sessions'::regclass AND f.contype='f')
 LOOP
  predicate:=format('public.edrion_petros_owner(institution_id,student_id) AND (session_id IS NULL OR EXISTS(SELECT 1 FROM public.petros_learning_sessions s WHERE s.id=%I.session_id AND s.institution_id=%I.institution_id AND s.student_id=%I.student_id))',r.table_name,r.table_name,r.table_name);
  EXECUTE format('DROP POLICY IF EXISTS m0r_owner_allow ON public.%I',r.table_name);
  EXECUTE format('DROP POLICY IF EXISTS m0r_owner_guard ON public.%I',r.table_name);
  EXECUTE format('CREATE POLICY m0r_owner_allow ON public.%I FOR ALL TO edrion_app,edrion_petros_document_worker USING (%s) WITH CHECK (%s)',r.table_name,predicate,predicate);
  EXECUTE format('CREATE POLICY m0r_owner_guard ON public.%I AS RESTRICTIVE FOR ALL TO edrion_app,edrion_petros_document_worker USING (%s) WITH CHECK (%s)',r.table_name,predicate,predicate);
 END LOOP;
END $$;

-- Shared extraction may be stored before enrollment exists, but only for the
-- exact authorized material backed by the initiating staff user's live object.
CREATE OR REPLACE FUNCTION public.edrion_petros_staff_material(i uuid,m uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(current_user='edrion_app' AND i::text=public.edrion_current_institution()
  AND public.edrion_current_student() IS NULL AND public.edrion_current_independent_user() IS NULL
  AND m::text=NULLIF(current_setting('app.source_item_id',true),'')
  AND EXISTS(SELECT 1 FROM public.class_materials cm JOIN public.storage_objects o ON o.id=cm.object_id AND o.institution_id=i
    JOIN public.institution_users u ON u.id=o.owner_staff_user_id AND u.institution_id=i AND u.status='active'
    JOIN public.staff st ON st.institution_user_id=u.id AND st.institution_id=i AND st.status='active'
    WHERE cm.id=m AND cm.institution_id=i AND cm.context_id::text=NULLIF(current_setting('app.course_id',true),'')
      AND u.id::text=NULLIF(current_setting('app.institution_user_id',true),'') AND o.processing_status='ready'),false)
$$;
REVOKE ALL ON FUNCTION public.edrion_petros_staff_material(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edrion_petros_staff_material(uuid,uuid) TO edrion_app,edrion_petros_document_worker,edrion_petros_document_evaluator;

-- Current readers use complete immutable extraction pages, with legacy fallback
-- only when no published extraction exists at the current ordinal.
CREATE OR REPLACE FUNCTION public.edrion_petros_document_live(i uuid, k_id uuid, m uuid, v integer, h text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT (k_id IS NULL AND current_user='edrion_app' AND public.edrion_petros_staff_material(i,m)
   AND EXISTS(SELECT 1 FROM public.class_materials cm WHERE cm.id=m AND cm.version=v))
  OR EXISTS(SELECT 1 FROM public.knowledge_items k
  WHERE k.institution_id=i AND k.source_revoked_at IS NULL AND k.status='ready' AND (k.version=v OR (m IS NOT NULL AND k.origin->>'materialVersion'=v::text))
   AND NOT EXISTS(SELECT 1 FROM public.knowledge_item_versions kv WHERE kv.item_id=k.id AND kv.ordinal=k.version AND (kv.invalidated_at IS NOT NULL OR kv.state<>'complete' OR NOT kv.admissible))
   AND (k.id=k_id OR (m IS NOT NULL AND k.origin->>'classMaterialId'=m::text))
   AND (m IS NULL OR public.edrion_petros_material_visible(m,i))
   AND jsonb_array_length(k.object_ids)=1
   AND EXISTS(SELECT 1 FROM public.storage_objects o WHERE o.id::text=k.object_ids->>0 AND o.institution_id=i
    AND o.processing_status IN('uploaded','ready')
    AND (k.origin->'petrosExtraction'->>'fileSha256' IS NULL OR k.origin->'petrosExtraction'->>'fileSha256'=o.checksum_sha256)
    AND (m IS NULL OR EXISTS(SELECT 1 FROM public.class_materials cm WHERE cm.id=m AND cm.object_id=o.id
      AND (k.origin->>'materialVersion' IS NULL OR k.origin->>'materialVersion'=cm.version::text))))
   AND CASE WHEN EXISTS(SELECT 1 FROM public.knowledge_item_versions kv WHERE kv.item_id=k.id AND kv.ordinal=k.version)
    THEN (SELECT encode(sha256(convert_to(string_agg(p.page_index::text || ':' || p.text,E'\n' ORDER BY p.page_index),'UTF8')),'hex')
      FROM public.knowledge_item_version_pages p JOIN public.knowledge_item_versions kv ON kv.id=p.version_id
      WHERE kv.item_id=k.id AND kv.ordinal=k.version AND kv.state='complete' AND kv.invalidated_at IS NULL AND kv.admissible)
    ELSE (SELECT encode(sha256(convert_to(string_agg(p.page_index::text || ':' || p.text,E'\n' ORDER BY p.page_index),'UTF8')),'hex')
      FROM public.knowledge_item_pages p WHERE p.item_id=k.id) END=h)
$$;

-- Staff access is read-only and tied to the exact course and item selected after
-- the service re-resolves current permissions/course/campus authority. Compiler
-- reads retain staff scope; recipient review additionally verifies enrollment.
CREATE OR REPLACE FUNCTION public.edrion_petros_staff_source(i uuid,k uuid,m uuid,s uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(current_user='edrion_app' AND i::text=public.edrion_current_institution()
  AND public.edrion_current_student() IS NULL AND public.edrion_current_independent_user() IS NULL
  AND k::text=NULLIF(current_setting('app.source_item_id',true),'')
  AND EXISTS(SELECT 1 FROM public.class_materials cm JOIN public.courses c ON c.id=cm.context_id
    JOIN public.course_enrollments e ON e.course_id=c.id AND e.student_id=s AND e.institution_id=i
    WHERE cm.id=m AND cm.institution_id=i AND cm.context_type='course' AND c.institution_id=i AND c.status='active'
      AND c.id::text=NULLIF(current_setting('app.course_id',true),'') AND cm.subject_id=c.subject_id)
  AND EXISTS(SELECT 1 FROM public.institution_users iu JOIN public.staff st ON st.institution_user_id=iu.id AND st.institution_id=i
    WHERE iu.id::text=NULLIF(current_setting('app.institution_user_id',true),'') AND iu.institution_id=i
      AND iu.status='active' AND st.status='active'),false)
$$;
REVOKE ALL ON FUNCTION public.edrion_petros_staff_source(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edrion_petros_staff_source(uuid,uuid,uuid,uuid) TO edrion_app;
DROP POLICY IF EXISTS m0r_owner_guard ON public.knowledge_items;
CREATE POLICY m0r_owner_guard ON public.knowledge_items AS RESTRICTIVE FOR ALL TO edrion_app
 USING(public.edrion_petros_owner(institution_id,student_id,independent_user_id)
  OR (source_revoked_at IS NULL AND public.edrion_petros_staff_source(institution_id,id,CASE WHEN origin->>'classMaterialId' ~ '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' THEN (origin->>'classMaterialId')::uuid ELSE NULL END,student_id)))
 WITH CHECK(public.edrion_petros_owner(institution_id,student_id,independent_user_id));
DROP POLICY IF EXISTS m0r_worker_knowledge_guard ON public.knowledge_items;
CREATE POLICY m0r_worker_knowledge_guard ON public.knowledge_items AS RESTRICTIVE FOR ALL TO edrion_petros_document_worker
 USING(public.edrion_petros_owner(institution_id,student_id,independent_user_id))
 WITH CHECK(public.edrion_petros_owner(institution_id,student_id,independent_user_id));
DROP POLICY IF EXISTS m0r_staff_source_allow ON public.knowledge_items;
CREATE POLICY m0r_staff_source_allow ON public.knowledge_items FOR SELECT TO edrion_app
 USING(source_revoked_at IS NULL AND public.edrion_petros_staff_source(institution_id,id,CASE WHEN origin->>'classMaterialId' ~ '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' THEN (origin->>'classMaterialId')::uuid ELSE NULL END,student_id));
-- PostgreSQL also applies UPDATE USING policies to SELECT FOR SHARE. Permit
-- locking the selected staff source; the restrictive WITH CHECK remains owner-only.
DROP POLICY IF EXISTS m0r_staff_source_lock ON public.knowledge_items;
CREATE POLICY m0r_staff_source_lock ON public.knowledge_items FOR UPDATE TO edrion_app
 USING(source_revoked_at IS NULL AND public.edrion_petros_staff_source(institution_id,id,CASE WHEN origin->>'classMaterialId' ~ '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' THEN (origin->>'classMaterialId')::uuid ELSE NULL END,student_id))
 WITH CHECK(false);

-- Evaluator is read-only, owner-scoped and limited to the exact active session
-- and its released lesson. The session predicate avoids an artifact/session RLS cycle.
DROP POLICY IF EXISTS m0r_evaluator_knowledge ON public.knowledge_items;
CREATE POLICY m0r_evaluator_knowledge ON public.knowledge_items FOR SELECT TO edrion_petros_document_evaluator
 USING(public.edrion_petros_owner(institution_id,student_id,independent_user_id));
DROP POLICY IF EXISTS m0r_evaluator_pages ON public.knowledge_item_pages;
CREATE POLICY m0r_evaluator_pages ON public.knowledge_item_pages FOR SELECT TO edrion_petros_document_evaluator
 USING(EXISTS(SELECT 1 FROM public.knowledge_items k WHERE k.id=item_id));
DROP POLICY IF EXISTS m0r_evaluator_storage ON public.storage_objects;
CREATE POLICY m0r_evaluator_storage ON public.storage_objects FOR SELECT TO edrion_petros_document_evaluator
 USING(public.edrion_petros_owner(institution_id,owner_student_id,owner_independent_user_id)
  OR EXISTS(SELECT 1 FROM public.class_materials cm WHERE cm.object_id=storage_objects.id AND public.edrion_petros_material_visible(cm.id,storage_objects.institution_id)));
DROP POLICY IF EXISTS m0r_evaluator_session ON public.petros_learning_sessions;
CREATE POLICY m0r_evaluator_session ON public.petros_learning_sessions FOR SELECT TO edrion_petros_document_evaluator
 USING(id::text=NULLIF(current_setting('app.session_id',true),'') AND status='active'
  AND public.edrion_petros_owner(institution_id,student_id)
  AND EXISTS(SELECT 1 FROM public.students st JOIN public.institution_users iu ON iu.id=st.institution_user_id
    JOIN public.institution_user_roles ur ON ur.institution_user_id=iu.id AND ur.role_key='student'
    WHERE st.id=petros_learning_sessions.student_id AND st.institution_id=petros_learning_sessions.institution_id
      AND iu.institution_id=st.institution_id AND iu.status='active' AND iu.disabled_at IS NULL
      AND iu.password_reset_required_at IS NULL)
  AND EXISTS(SELECT 1 FROM public.knowledge_items k WHERE k.id::text=source_context->>'referenceId'
    AND k.institution_id=petros_learning_sessions.institution_id AND k.source_revoked_at IS NULL AND k.status='ready'
    AND (k.origin->>'classMaterialId' IS NULL OR public.edrion_petros_material_visible((k.origin->>'classMaterialId')::uuid,k.institution_id))
    AND EXISTS(SELECT 1 FROM public.knowledge_item_versions v WHERE v.item_id=k.id AND v.ordinal=k.version
      AND v.fingerprint=source_context->>'sourceFingerprint' AND v.invalidated_at IS NULL AND v.state='complete' AND v.admissible)
    AND jsonb_array_length(k.object_ids)=1
    AND EXISTS(SELECT 1 FROM public.storage_objects o WHERE o.id::text=k.object_ids->>0 AND o.institution_id=k.institution_id
      AND o.processing_status IN('uploaded','ready')
      AND (k.origin->'petrosExtraction'->>'fileSha256' IS NULL OR k.origin->'petrosExtraction'->>'fileSha256'=o.checksum_sha256)
      AND (k.origin->>'classMaterialId' IS NULL OR EXISTS(SELECT 1 FROM public.class_materials cm
        WHERE cm.id::text=k.origin->>'classMaterialId' AND cm.object_id=o.id
          AND (k.origin->>'materialVersion' IS NULL OR k.origin->>'materialVersion'=cm.version::text))))));
DROP POLICY IF EXISTS m0r_evaluator_revision ON public.petros_document_source_revisions;
CREATE POLICY m0r_evaluator_revision ON public.petros_document_source_revisions FOR SELECT TO edrion_petros_document_evaluator
 USING(public.edrion_petros_document_live(institution_id,canonical_knowledge_item_id,class_material_id,document_version,checksum));
DROP POLICY IF EXISTS m0r_evaluator_path ON public.petros_document_learner_paths;
CREATE POLICY m0r_evaluator_path ON public.petros_document_learner_paths FOR SELECT TO edrion_petros_document_evaluator
 USING(status='active' AND public.edrion_petros_owner(institution_id,student_id)
  AND EXISTS(SELECT 1 FROM public.petros_document_source_revisions r WHERE r.id=source_revision_id));
DROP POLICY IF EXISTS m0r_evaluator_artifact ON public.petros_document_lesson_artifacts;
CREATE POLICY m0r_evaluator_artifact ON public.petros_document_lesson_artifacts FOR SELECT TO edrion_petros_document_evaluator
 USING(id::text=NULLIF(current_setting('app.lesson_id',true),'') AND status='published'
  AND EXISTS(SELECT 1 FROM public.petros_learning_sessions s JOIN public.petros_document_learner_paths p ON p.source_revision_id=petros_document_lesson_artifacts.source_revision_id
    WHERE s.learner_context->>'documentLessonId'=petros_document_lesson_artifacts.id::text AND p.knowledge_item_id::text=s.source_context->>'referenceId')
  AND EXISTS(SELECT 1 FROM public.petros_document_learner_paths p WHERE p.source_revision_id=petros_document_lesson_artifacts.source_revision_id AND p.status='active'));

-- One path can prepare multiple concepts. All work is still constrained to one
-- live revision; a job cannot choose an unrelated or cancelled owner's source.
DROP POLICY IF EXISTS m0r_worker_preparation ON public.petros_document_preparations;
CREATE POLICY m0r_worker_preparation ON public.petros_document_preparations AS RESTRICTIVE FOR ALL TO edrion_petros_document_worker
 USING(id::text=NULLIF(current_setting('app.preparation_id',true),'') AND EXISTS(
  SELECT 1 FROM public.petros_document_learner_paths p WHERE p.source_revision_id=petros_document_preparations.source_revision_id AND p.status='active'))
 WITH CHECK(EXISTS(SELECT 1 FROM public.petros_document_learner_paths p WHERE p.source_revision_id=petros_document_preparations.source_revision_id AND p.status='active'));
GRANT INSERT(institution_id,source_revision_id,requested_concept_id,generator_version,request_context,status,stage,progress,message)
 ON public.petros_document_preparations TO edrion_petros_document_worker;

-- PostgreSQL requires an UPDATE privilege for SELECT FOR SHARE. Grant only the
-- identity column for locking and reject every actual worker UPDATE by trigger.
-- No SECURITY DEFINER/owner bypass is introduced to acquire authority locks.
CREATE OR REPLACE FUNCTION public.edrion_petros_worker_lock_only()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$ BEGIN
 IF current_user='edrion_petros_document_worker' THEN RAISE EXCEPTION 'PETROS_WORKER_SOURCE_MUTATION_DENIED'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['knowledge_items','knowledge_item_versions','storage_objects','students','institution_users','institution_user_roles','class_materials','courses','course_enrollments','petros_document_learner_paths'] LOOP
  EXECUTE format('GRANT UPDATE(id) ON public.%I TO edrion_petros_document_worker',t);
  EXECUTE format('DROP TRIGGER IF EXISTS m0r_worker_lock_only ON public.%I',t);
  EXECUTE format('CREATE TRIGGER m0r_worker_lock_only BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.edrion_petros_worker_lock_only()',t);
 END LOOP;
END $$;

REVOKE UPDATE ON public.petros_document_lesson_artifacts FROM edrion_petros_document_worker;

-- Current teacher goals expose only participation metadata through an explicitly
-- selected assignment, after the service checks class/subject/campus authority.
CREATE OR REPLACE FUNCTION public.edrion_petros_staff_assignment(i uuid,s uuid,c jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(current_user='edrion_app' AND i::text=public.edrion_current_institution()
  AND public.edrion_current_student() IS NULL AND public.edrion_current_independent_user() IS NULL
  AND c->'assignmentContext'->>'assignmentId'=NULLIF(current_setting('app.assignment_id',true),'')
  AND EXISTS(SELECT 1 FROM public.assignments a JOIN public.assignment_assignees aa ON aa.assignment_id=a.id AND aa.student_id=s
    JOIN public.class_subject_teachers ct ON ct.class_id=a.class_id AND ct.subject_id=a.subject_id AND ct.institution_id=i
    JOIN public.staff st ON st.id=ct.teacher_id AND st.institution_id=i AND st.status='active'
    JOIN public.institution_users u ON u.id=st.institution_user_id AND u.institution_id=i AND u.status='active'
    WHERE a.id::text=NULLIF(current_setting('app.assignment_id',true),'') AND a.institution_id=i AND a.petros_guidance IS NOT NULL
      AND u.id::text=NULLIF(current_setting('app.institution_user_id',true),'')),false)
$$;
REVOKE ALL ON FUNCTION public.edrion_petros_staff_assignment(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edrion_petros_staff_assignment(uuid,uuid,jsonb) TO edrion_app;
DROP POLICY IF EXISTS m0r_owner_guard ON public.petros_learning_sessions;
CREATE POLICY m0r_owner_guard ON public.petros_learning_sessions AS RESTRICTIVE FOR ALL TO edrion_app
 USING(public.edrion_petros_owner(institution_id,student_id) OR public.edrion_petros_staff_assignment(institution_id,student_id,source_context))
 WITH CHECK(public.edrion_petros_owner(institution_id,student_id));
DROP POLICY IF EXISTS m0r_worker_session_guard ON public.petros_learning_sessions;
CREATE POLICY m0r_worker_session_guard ON public.petros_learning_sessions AS RESTRICTIVE FOR ALL TO edrion_petros_document_worker
 USING(public.edrion_petros_owner(institution_id,student_id)) WITH CHECK(public.edrion_petros_owner(institution_id,student_id));
DROP POLICY IF EXISTS m0r_staff_participation ON public.petros_learning_sessions;
CREATE POLICY m0r_staff_participation ON public.petros_learning_sessions FOR SELECT TO edrion_app
 USING(public.edrion_petros_staff_assignment(institution_id,student_id,source_context));

-- Administrative policy events have no learner owner. They remain private to
-- their current authenticated staff actor and keep existing append-only grants.
CREATE OR REPLACE FUNCTION public.edrion_petros_current_staff(i uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(current_user='edrion_app' AND i::text=public.edrion_current_institution()
  AND public.edrion_current_student() IS NULL AND public.edrion_current_independent_user() IS NULL
  AND EXISTS(SELECT 1 FROM public.institution_users u WHERE u.institution_id=i AND u.status='active'
    AND u.id::text=NULLIF(current_setting('app.institution_user_id',true),'')),false)
$$;
REVOKE ALL ON FUNCTION public.edrion_petros_current_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edrion_petros_current_staff(uuid) TO edrion_app;
DROP POLICY IF EXISTS m0r_owner_guard ON public.petros_institutional_events;
CREATE POLICY m0r_owner_guard ON public.petros_institutional_events AS RESTRICTIVE FOR ALL TO edrion_app
 USING(public.edrion_petros_owner(institution_id,student_id) OR (student_id IS NULL AND actor_kind IN('institution_user','teacher')
  AND actor_id::text=NULLIF(current_setting('app.institution_user_id',true),'') AND public.edrion_petros_current_staff(institution_id)))
 WITH CHECK(public.edrion_petros_owner(institution_id,student_id) OR (student_id IS NULL AND actor_kind IN('institution_user','teacher')
  AND actor_id::text=NULLIF(current_setting('app.institution_user_id',true),'') AND public.edrion_petros_current_staff(institution_id)));
DROP POLICY IF EXISTS m0r_staff_policy_event ON public.petros_institutional_events;
CREATE POLICY m0r_staff_policy_event ON public.petros_institutional_events FOR ALL TO edrion_app
 USING(student_id IS NULL AND actor_kind IN('institution_user','teacher') AND actor_id::text=NULLIF(current_setting('app.institution_user_id',true),'') AND public.edrion_petros_current_staff(institution_id))
 WITH CHECK(student_id IS NULL AND actor_kind IN('institution_user','teacher') AND actor_id::text=NULLIF(current_setting('app.institution_user_id',true),'') AND public.edrion_petros_current_staff(institution_id));
DROP POLICY IF EXISTS m0r_worker_event_guard ON public.petros_institutional_events;
CREATE POLICY m0r_worker_event_guard ON public.petros_institutional_events AS RESTRICTIVE FOR ALL TO edrion_petros_document_worker
 USING(public.edrion_petros_owner(institution_id,student_id)) WITH CHECK(public.edrion_petros_owner(institution_id,student_id));
REVOKE UPDATE,DELETE,TRUNCATE ON public.petros_institutional_events FROM edrion_app,edrion_petros_document_worker;
DROP TRIGGER IF EXISTS m0r_history_immutable ON public.petros_institutional_events;
CREATE TRIGGER m0r_history_immutable BEFORE UPDATE OR DELETE ON public.petros_institutional_events FOR EACH ROW EXECUTE FUNCTION public.edrion_block_mutation();
DROP TRIGGER IF EXISTS m0r_history_no_truncate ON public.petros_institutional_events;
CREATE TRIGGER m0r_history_no_truncate BEFORE TRUNCATE ON public.petros_institutional_events FOR EACH STATEMENT EXECUTE FUNCTION public.edrion_block_mutation();

-- Staff bootstrap reads only the specifically requested explicit-sharing record.
-- Services then verify current course/enrollment authority before recipient scope.
DO $$ DECLARE t text; owner_predicate text; selected text; BEGIN
 FOREACH t IN ARRAY ARRAY['petros_qualitative_events','petros_qualitative_submissions','petros_qualitative_reviews'] LOOP
  owner_predicate:='public.edrion_petros_owner(institution_id,student_id)';
  IF t='petros_qualitative_submissions' THEN
   owner_predicate:=owner_predicate||' AND EXISTS(SELECT 1 FROM public.petros_learning_sessions s WHERE s.id=petros_qualitative_submissions.session_id AND s.institution_id=petros_qualitative_submissions.institution_id AND s.student_id=petros_qualitative_submissions.student_id)';
  END IF;
  selected:='id::text=NULLIF(current_setting(''app.review_request_id'',true),'''') AND public.edrion_petros_current_staff(institution_id)';
  EXECUTE format('DROP POLICY IF EXISTS m0r_owner_guard ON public.%I',t);
  EXECUTE format('CREATE POLICY m0r_owner_guard ON public.%I AS RESTRICTIVE FOR ALL TO edrion_app USING ((%s) OR (%s)) WITH CHECK (%s)',t,owner_predicate,selected,owner_predicate);
  EXECUTE format('DROP POLICY IF EXISTS m0r_staff_shared_review ON public.%I',t);
  EXECUTE format('CREATE POLICY m0r_staff_shared_review ON public.%I FOR SELECT TO edrion_app USING (%s)',t,selected);
  EXECUTE format('DROP POLICY IF EXISTS m0r_worker_review_guard ON public.%I',t);
  EXECUTE format('CREATE POLICY m0r_worker_review_guard ON public.%I AS RESTRICTIVE FOR ALL TO edrion_petros_document_worker USING (%s) WITH CHECK (%s)',t,owner_predicate,owner_predicate);
 END LOOP;
END $$;

-- PLAN content is immutable, but the existing V1 runtime completes its bounded
-- planned -> rendered -> completed lifecycle. Only those receipt fields can change.
CREATE OR REPLACE FUNCTION public.edrion_petros_plan_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Petros planning history cannot be erased'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','resulting_block_id','render_request_id','route_reference','observed_outcome','updated_at'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','resulting_block_id','render_request_id','route_reference','observed_outcome','updated_at']) THEN
  RAISE EXCEPTION 'Petros planning content is immutable';
 END IF;
 IF NOT ((OLD.status IN('planned','overridden') AND NEW.status='rendered') OR (OLD.status='rendered' AND NEW.status='completed')
   OR (OLD.status='rendered' AND NEW.status='rendered' AND OLD.resulting_block_id IS NULL AND NEW.resulting_block_id IS NOT NULL
    AND (to_jsonb(NEW)-ARRAY['resulting_block_id','updated_at'])=(to_jsonb(OLD)-ARRAY['resulting_block_id','updated_at']))
   OR (to_jsonb(NEW)-'updated_at')=(to_jsonb(OLD)-'updated_at'))
   OR (OLD.resulting_block_id IS NOT NULL AND NEW.resulting_block_id IS DISTINCT FROM OLD.resulting_block_id)
   OR (OLD.render_request_id IS NOT NULL AND NEW.render_request_id IS DISTINCT FROM OLD.render_request_id)
   OR (OLD.status='rendered' AND NEW.route_reference IS DISTINCT FROM OLD.route_reference) THEN
  RAISE EXCEPTION 'Petros planning lifecycle transition denied';
 END IF;
 IF NEW.resulting_block_id IS DISTINCT FROM OLD.resulting_block_id AND NEW.resulting_block_id IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.petros_teaching_blocks b WHERE b.id=NEW.resulting_block_id
    AND b.decision_id=NEW.id AND b.session_id=NEW.session_id AND b.institution_id=NEW.institution_id AND b.student_id=NEW.student_id) THEN
  RAISE EXCEPTION 'Petros planning block ownership denied';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.edrion_petros_plan_lifecycle() FROM PUBLIC;
GRANT UPDATE(status,resulting_block_id,render_request_id,route_reference,observed_outcome,updated_at) ON public.petros_planning_decisions TO edrion_app;
DROP TRIGGER IF EXISTS m0r_history_immutable ON public.petros_planning_decisions;
CREATE TRIGGER m0r_history_immutable BEFORE UPDATE OR DELETE ON public.petros_planning_decisions FOR EACH ROW EXECUTE FUNCTION public.edrion_petros_plan_lifecycle();
