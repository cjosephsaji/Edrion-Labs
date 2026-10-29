-- Final M1 security overlay, ordered after the final M0-R grants/RLS baseline.
-- Proposal only. Repeated standalone replay must restore restrictive ACLs.
DO $m1_install$ BEGIN
 IF to_regclass('public.petros_content_units') IS NOT NULL THEN
  EXECUTE $m1_security$
CREATE OR REPLACE FUNCTION edrion_petros_v2_source_live(i uuid,b jsonb,h text,write_access boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(
  current_user='edrion_app' AND i::text=public.edrion_current_institution()
  AND public.edrion_current_independent_user() IS NULL
  AND (public.edrion_current_student() IS NULL OR EXISTS(SELECT 1 FROM public.students st
   JOIN public.institution_users u ON u.id=st.institution_user_id AND u.institution_id=i
   JOIN public.institution_user_roles ur ON ur.institution_user_id=u.id AND ur.role_key='student'
   WHERE st.id::text=public.edrion_current_student() AND st.institution_id=i AND st.status='enrolled'
    AND u.status='active' AND u.disabled_at IS NULL AND u.password_reset_required_at IS NULL
    AND NOT (u.direct_denies ? 'student.learn.use' OR u.direct_denies ? '*')))
  AND (public.edrion_current_student() IS NOT NULL OR EXISTS(SELECT 1 FROM public.institution_users u
   WHERE u.id::text=NULLIF(current_setting('app.institution_user_id',true),'') AND u.institution_id=i
    AND u.status='active' AND u.disabled_at IS NULL AND u.password_reset_required_at IS NULL
    AND (NOT write_access OR NOT (u.direct_denies ? 'class_content.manage' OR u.direct_denies ? 'syllabus.manage' OR u.direct_denies ? '*'))))
  AND EXISTS(SELECT 1 FROM public.storage_objects o
   WHERE o.id::text=b->>'objectId' AND o.institution_id=i
    AND o.processing_status='ready' AND o.checksum_sha256=h
    AND CASE b->>'kind'
     WHEN 'material' THEN EXISTS(SELECT 1 FROM public.class_materials cm
      WHERE cm.institution_id=i AND cm.id::text=b->>'materialId'
       AND cm.source_revoked_at IS NULL
       AND cm.object_id=o.id AND cm.version::text=b->>'materialVersion'
       AND cm.context_type=b->>'contextKind' AND cm.context_id::text=b->>'contextId'
       AND cm.subject_id::text=b->>'subjectId'
       AND EXISTS(SELECT 1 FROM public.subjects su WHERE su.id=cm.subject_id AND su.institution_id=i)
       AND (cm.context_type<>'course' OR EXISTS(SELECT 1 FROM public.courses co WHERE co.id=cm.context_id AND co.institution_id=i AND co.subject_id=cm.subject_id AND co.status='active'))
       AND ((NOT write_access AND public.edrion_petros_material_visible(cm.id,i))
        OR (public.edrion_current_student() IS NULL
         AND o.owner_staff_user_id::text=NULLIF(current_setting('app.institution_user_id',true),'')
         AND public.edrion_petros_staff_material(i,cm.id))))
     WHEN 'guidance_attachment' THEN
      o.kind='petros_guidance_attachment'
      AND o.derived->'guidanceBinding'->>'classId'=b->>'classId'
      AND o.derived->'guidanceBinding'->>'subjectId'=b->>'subjectId'
      AND EXISTS(SELECT 1 FROM public.assignments a
       WHERE a.id::text=b->>'assignmentId' AND a.institution_id=i AND a.status='published'
        AND a.version::text=b->>'publicationVersion' AND a.class_id::text=b->>'classId'
        AND a.subject_id::text=b->>'subjectId'
        AND a.petros_guidance->'attachmentObjectIds' @> jsonb_build_array(o.id::text)
        AND ((NOT write_access AND public.edrion_petros_guidance_file_visible(o.id,i,o.derived->'guidanceBinding')
          AND EXISTS(SELECT 1 FROM public.assignment_assignees aa WHERE aa.assignment_id=a.id AND aa.student_id::text=public.edrion_current_student()))
         OR (public.edrion_current_student() IS NULL
          AND EXISTS(SELECT 1 FROM public.staff st JOIN public.institution_users u ON u.id=st.institution_user_id
           WHERE st.id=a.teacher_id AND st.institution_id=i AND st.status='active'
            AND u.institution_id=i AND u.status='active' AND u.disabled_at IS NULL
            AND u.id::text=NULLIF(current_setting('app.institution_user_id',true),'')
            AND o.owner_staff_user_id=u.id))))
     ELSE false END),false)
$$;
REVOKE ALL ON FUNCTION edrion_petros_v2_source_live(uuid,jsonb,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION edrion_petros_v2_source_live(uuid,jsonb,text,boolean) TO edrion_app;
DROP POLICY IF EXISTS m1_revision_allow ON petros_document_source_revisions;
CREATE POLICY m1_revision_allow ON petros_document_source_revisions FOR ALL TO edrion_app
 USING(format_version='v2' AND edrion_petros_v2_source_live(institution_id,v2_revision->'source'->'binding',checksum))
 WITH CHECK(format_version='v2' AND edrion_petros_v2_source_live(institution_id,v2_revision->'source'->'binding',checksum,true));
DROP POLICY IF EXISTS m1_revision_guard ON petros_document_source_revisions;
CREATE POLICY m1_revision_guard ON petros_document_source_revisions AS RESTRICTIVE FOR ALL TO edrion_app
 USING(format_version='v1' OR edrion_petros_v2_source_live(institution_id,v2_revision->'source'->'binding',checksum))
 WITH CHECK(format_version='v1' OR edrion_petros_v2_source_live(institution_id,v2_revision->'source'->'binding',checksum,true));
DROP POLICY IF EXISTS m1_worker_revision_guard ON petros_document_source_revisions;
CREATE POLICY m1_worker_revision_guard ON petros_document_source_revisions AS RESTRICTIVE FOR ALL TO edrion_petros_document_worker,edrion_petros_document_evaluator
 USING(format_version='v1') WITH CHECK(format_version='v1');

DROP POLICY IF EXISTS m1_units_read ON petros_content_units;
CREATE POLICY m1_units_read ON petros_content_units FOR SELECT TO edrion_app
 USING(EXISTS(SELECT 1 FROM petros_document_source_revisions r WHERE r.id=source_revision_id AND r.institution_id=petros_content_units.institution_id AND r.format_version='v2'));
DROP POLICY IF EXISTS m1_units_write ON petros_content_units;
CREATE POLICY m1_units_write ON petros_content_units FOR INSERT TO edrion_app
 WITH CHECK(created_by::text=NULLIF(current_setting('app.institution_user_id',true),'') AND EXISTS(SELECT 1 FROM petros_document_source_revisions r
  WHERE r.id=source_revision_id AND r.institution_id=petros_content_units.institution_id AND r.format_version='v2'
    AND edrion_petros_v2_source_live(r.institution_id,r.v2_revision->'source'->'binding',r.checksum,true)));
DROP POLICY IF EXISTS m1_units_guard ON petros_content_units;
CREATE POLICY m1_units_guard ON petros_content_units AS RESTRICTIVE FOR ALL TO edrion_app
 USING(EXISTS(SELECT 1 FROM petros_document_source_revisions r WHERE r.id=source_revision_id AND r.institution_id=petros_content_units.institution_id AND r.format_version='v2'))
 WITH CHECK(created_by::text=NULLIF(current_setting('app.institution_user_id',true),'') AND EXISTS(SELECT 1 FROM petros_document_source_revisions r
  WHERE r.id=source_revision_id AND r.institution_id=petros_content_units.institution_id AND r.format_version='v2'
    AND edrion_petros_v2_source_live(r.institution_id,r.v2_revision->'source'->'binding',r.checksum,true)));

CREATE OR REPLACE FUNCTION edrion_petros_m1_concept_actor(i uuid,c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(current_user='edrion_app' AND i::text=public.edrion_current_institution() AND public.edrion_current_student() IS NULL
 AND public.edrion_current_independent_user() IS NULL AND EXISTS(SELECT 1 FROM public.staff st JOIN public.institution_users u ON u.id=st.institution_user_id
 WHERE st.institution_id=i AND u.institution_id=i AND st.status='active' AND u.status='active' AND u.disabled_at IS NULL
 AND u.id::text=NULLIF(current_setting('app.institution_user_id',true),'') AND (c IS NULL OR EXISTS(SELECT 1 FROM public.courses co WHERE co.id=c AND co.institution_id=i AND co.status='active' AND co.professor_teacher_id=st.id))),false)
$$;
REVOKE ALL ON FUNCTION edrion_petros_m1_concept_actor(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION edrion_petros_m1_concept_actor(uuid,uuid) TO edrion_app;
DROP POLICY IF EXISTS m1_concepts_read ON petros_concepts;
CREATE POLICY m1_concepts_read ON petros_concepts FOR SELECT TO edrion_app USING(edrion_petros_m1_concept_actor(institution_id,course_id));
DROP POLICY IF EXISTS m1_concepts_write ON petros_concepts;
CREATE POLICY m1_concepts_write ON petros_concepts FOR INSERT TO edrion_app WITH CHECK(edrion_petros_m1_concept_actor(institution_id,course_id) AND created_by::text=NULLIF(current_setting('app.institution_user_id',true),''));
DROP POLICY IF EXISTS m1_concepts_guard ON petros_concepts;
CREATE POLICY m1_concepts_guard ON petros_concepts AS RESTRICTIVE FOR ALL TO edrion_app USING(edrion_petros_m1_concept_actor(institution_id,course_id)) WITH CHECK(edrion_petros_m1_concept_actor(institution_id,course_id) AND created_by::text=NULLIF(current_setting('app.institution_user_id',true),''));
DROP POLICY IF EXISTS m1_versions_read ON petros_concept_versions;
CREATE POLICY m1_versions_read ON petros_concept_versions FOR SELECT TO edrion_app USING(EXISTS(SELECT 1 FROM petros_concepts c WHERE c.id=concept_id AND c.institution_id=petros_concept_versions.institution_id));
DROP POLICY IF EXISTS m1_versions_write ON petros_concept_versions;
CREATE POLICY m1_versions_write ON petros_concept_versions FOR INSERT TO edrion_app WITH CHECK(created_by::text=NULLIF(current_setting('app.institution_user_id',true),'') AND EXISTS(SELECT 1 FROM petros_concepts c WHERE c.id=concept_id AND c.institution_id=petros_concept_versions.institution_id));
DROP POLICY IF EXISTS m1_versions_guard ON petros_concept_versions;
CREATE POLICY m1_versions_guard ON petros_concept_versions AS RESTRICTIVE FOR ALL TO edrion_app USING(EXISTS(SELECT 1 FROM petros_concepts c WHERE c.id=concept_id AND c.institution_id=petros_concept_versions.institution_id)) WITH CHECK(created_by::text=NULLIF(current_setting('app.institution_user_id',true),'') AND EXISTS(SELECT 1 FROM petros_concepts c WHERE c.id=concept_id AND c.institution_id=petros_concept_versions.institution_id));
REVOKE ALL ON petros_concepts,petros_concept_versions,petros_content_units FROM PUBLIC,edrion_petros_document_worker,edrion_petros_document_evaluator,edrion_app;
GRANT SELECT,INSERT ON petros_concepts,petros_concept_versions,petros_content_units TO edrion_app;


  $m1_security$;
  EXECUTE $m1_bindings$
DROP POLICY IF EXISTS m1_material_visibility_guard ON public.class_materials;
CREATE POLICY m1_material_visibility_guard ON public.class_materials AS RESTRICTIVE FOR ALL
 TO edrion_app,edrion_petros_document_worker,edrion_petros_document_evaluator
 USING(source_revoked_at IS NULL OR (current_user='edrion_app'
  AND public.edrion_current_student() IS NULL
  AND public.edrion_current_independent_user() IS NULL
  AND EXISTS(SELECT 1 FROM public.institution_users u JOIN public.staff st
   ON st.institution_user_id=u.id AND st.institution_id=u.institution_id
   WHERE u.institution_id=class_materials.institution_id
    AND u.id::text=NULLIF(current_setting('app.institution_user_id',true),'')
    AND u.status='active' AND u.disabled_at IS NULL AND st.status='active'))) WITH CHECK(true);
DROP POLICY IF EXISTS m1_candidate_source_guard ON public.petros_teaching_pack_candidates;
CREATE POLICY m1_candidate_source_guard ON public.petros_teaching_pack_candidates AS RESTRICTIVE FOR ALL TO edrion_app
 USING(source_format='v1' OR (public.edrion_current_student() IS NULL AND EXISTS(SELECT 1 FROM public.petros_document_source_revisions r WHERE r.id=source_revision_id AND r.institution_id=petros_teaching_pack_candidates.institution_id AND r.format_version='v2')))
 WITH CHECK(source_format='v1' OR (created_by_user_id::text=NULLIF(current_setting('app.institution_user_id',true),'') AND EXISTS(SELECT 1 FROM public.petros_document_source_revisions r WHERE r.id=source_revision_id AND r.institution_id=petros_teaching_pack_candidates.institution_id AND r.format_version='v2' AND public.edrion_petros_v2_source_live(r.institution_id,r.v2_revision->'source'->'binding',r.checksum,true))));
DROP POLICY IF EXISTS m1_review_release_guard ON public.petros_teaching_pack_reviews;
CREATE POLICY m1_review_release_guard ON public.petros_teaching_pack_reviews AS RESTRICTIVE FOR ALL TO edrion_app
 USING(source_format='v1' OR (public.edrion_current_student() IS NULL AND EXISTS(SELECT 1 FROM public.petros_document_source_revisions r WHERE r.id=source_revision_id AND r.institution_id=petros_teaching_pack_reviews.institution_id AND r.format_version='v2')))
 WITH CHECK(source_format='v1'); -- M3 must wire qualified V2 review authority before publication.
DROP POLICY IF EXISTS m1_preparation_v2_allow ON public.knowledge_preparations;
CREATE POLICY m1_preparation_v2_allow ON public.knowledge_preparations FOR ALL TO edrion_app
 USING(operation_version='v2' AND public.edrion_petros_v2_source_live(institution_id,source_binding,(SELECT o.checksum_sha256 FROM public.storage_objects o WHERE o.id=object_id AND o.institution_id=knowledge_preparations.institution_id)))
 WITH CHECK(operation_version='v2' AND requested_by::text=NULLIF(current_setting('app.institution_user_id',true),'') AND public.edrion_petros_v2_source_live(institution_id,source_binding,(SELECT o.checksum_sha256 FROM public.storage_objects o WHERE o.id=object_id AND o.institution_id=knowledge_preparations.institution_id),true));
DROP POLICY IF EXISTS m1_preparation_v2_guard ON public.knowledge_preparations;
CREATE POLICY m1_preparation_v2_guard ON public.knowledge_preparations AS RESTRICTIVE FOR ALL TO edrion_app
 USING(operation_version='v1' OR public.edrion_petros_v2_source_live(institution_id,source_binding,(SELECT o.checksum_sha256 FROM public.storage_objects o WHERE o.id=object_id AND o.institution_id=knowledge_preparations.institution_id)))
 WITH CHECK(operation_version='v1' OR (requested_by::text=NULLIF(current_setting('app.institution_user_id',true),'') AND public.edrion_petros_v2_source_live(institution_id,source_binding,(SELECT o.checksum_sha256 FROM public.storage_objects o WHERE o.id=object_id AND o.institution_id=knowledge_preparations.institution_id),true)));
-- An authorized V1 session keeps its exact original file after republication.
-- Resolve through owned, complete, non-invalidated immutable versions and current
-- material entitlement. This grants no write, worker or unrelated asset access.
CREATE OR REPLACE FUNCTION public.edrion_petros_m1_historical_asset(o uuid,i uuid,h text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$ BEGIN
 IF current_user<>'edrion_app' OR public.edrion_current_student() IS NULL OR i::text IS DISTINCT FROM public.edrion_current_institution() THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM public.knowledge_items k JOIN public.knowledge_item_versions v ON v.item_id=k.id
  WHERE k.institution_id=i AND public.edrion_petros_owner(k.institution_id,k.student_id) AND k.source_revoked_at IS NULL
   AND v.object_id=o AND v.state='complete' AND v.invalidated_at IS NULL AND v.admissible
   AND v.snapshot->'origin'->>'source'='teacher_class_material'
   AND v.snapshot->'origin'->>'classMaterialId'=k.origin->>'classMaterialId'
   AND v.snapshot->'origin'->'petrosExtraction'->>'fileSha256'=h
   AND CASE WHEN k.origin->>'classMaterialId' ~ '^[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$'
    THEN public.edrion_petros_material_visible((k.origin->>'classMaterialId')::uuid,i) ELSE false END);
END $$;
REVOKE ALL ON FUNCTION public.edrion_petros_m1_historical_asset(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edrion_petros_m1_historical_asset(uuid,uuid,text) TO edrion_app,edrion_petros_document_worker;
DROP POLICY IF EXISTS m1_historical_asset_allow ON public.storage_objects;
CREATE POLICY m1_historical_asset_allow ON public.storage_objects FOR SELECT TO edrion_app
 USING(processing_status IN('uploaded','ready') AND public.edrion_petros_m1_historical_asset(id,institution_id,checksum_sha256));
DROP POLICY IF EXISTS m0r_storage_guard ON public.storage_objects;
CREATE POLICY m0r_storage_guard ON public.storage_objects AS RESTRICTIVE FOR ALL TO edrion_app,edrion_petros_document_worker
 USING(public.edrion_petros_owner(institution_id,owner_student_id,owner_independent_user_id)
  OR (institution_id::text=public.edrion_current_institution() AND public.edrion_current_student() IS NULL AND public.edrion_current_independent_user() IS NULL)
  OR EXISTS(SELECT 1 FROM public.class_materials cm WHERE cm.object_id=storage_objects.id AND public.edrion_petros_material_visible(cm.id,storage_objects.institution_id))
  OR (current_user='edrion_app' AND kind='petros_guidance_attachment' AND processing_status='ready' AND public.edrion_petros_guidance_file_visible(id,institution_id,derived->'guidanceBinding'))
  OR (processing_status IN('uploaded','ready') AND public.edrion_petros_m1_historical_asset(id,institution_id,checksum_sha256)))
 WITH CHECK(public.edrion_petros_owner(institution_id,owner_student_id,owner_independent_user_id)
  OR (institution_id::text=public.edrion_current_institution() AND public.edrion_current_student() IS NULL AND public.edrion_current_independent_user() IS NULL));
  $m1_bindings$;
 END IF;
END $m1_install$;
