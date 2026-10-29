-- M3 isolated SQL proposal. Not registered in the migration journal; never install on a configured target.
-- Existing durable preparation, candidate/review and curriculum owners only. No new tables.
ALTER TABLE petros_teaching_pack_candidates DROP CONSTRAINT IF EXISTS m1_candidate_source_union;
ALTER TABLE petros_teaching_pack_candidates ADD CONSTRAINT m1_candidate_source_union CHECK (((source_format='v1' AND source_item_id IS NOT NULL AND source_revision_id IS NULL)
 OR (source_format='v2' AND source_item_id IS NULL AND source_revision_id IS NOT NULL AND schema_version IN ('petros.v2.proposal.v1','petros.v2.learning-proposal.v1','petros.v2.private-verification-candidate.v1'))) IS TRUE);
DROP POLICY IF EXISTS m3_proposal_staff_guard ON petros_document_preparations;
CREATE POLICY m3_proposal_staff_guard ON petros_document_preparations AS RESTRICTIVE FOR ALL TO edrion_app
 USING (generator_version <> 'petros.m3.proposal.v1' OR (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL
  AND institution_id::text=edrion_current_institution() AND EXISTS(SELECT 1 FROM petros_document_source_revisions r
    WHERE r.id=source_revision_id AND edrion_petros_v2_source_live(r.institution_id,r.v2_revision->'source'->'binding',r.checksum,true))))
 WITH CHECK (generator_version <> 'petros.m3.proposal.v1' OR (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL
  AND institution_id::text=edrion_current_institution() AND request_context->>'actorId'=nullif(current_setting('app.institution_user_id',true),'')
  AND document_map->>'institutionId'=institution_id::text AND document_map->>'id'=requested_concept_id
  AND document_map->'source'->>'revisionId'=source_revision_id::text AND document_map->>'schemaVersion'='petros.v2.learning-proposal.v1'
  AND octet_length(document_map::text)<=110592 AND EXISTS(SELECT 1 FROM petros_document_source_revisions r
    WHERE r.id=source_revision_id AND document_map->'source'->'binding'=r.v2_revision->'source'->'binding'
    AND document_map->'source'->>'originalHash'=r.checksum
    AND document_map->>'subjectId'=r.v2_revision->'source'->'binding'->>'subjectId'
    AND CASE WHEN r.v2_revision->'source'->'binding'->>'kind'='guidance_attachment'
      THEN document_map->>'classId'=r.v2_revision->'source'->'binding'->>'classId'
      WHEN r.v2_revision->'source'->'binding'->>'contextKind'='class'
      THEN document_map->>'classId'=r.v2_revision->'source'->'binding'->>'contextId' AND document_map->'courseId'='null'::jsonb
      ELSE document_map->>'courseId'=r.v2_revision->'source'->'binding'->>'contextId' END
    AND EXISTS(SELECT 1 FROM class_subject_teachers ct JOIN staff st ON st.id=ct.teacher_id AND st.institution_id=ct.institution_id
      WHERE ct.institution_id=r.institution_id AND ct.class_id::text=document_map->>'classId' AND ct.subject_id::text=document_map->>'subjectId'
        AND st.institution_user_id::text=nullif(current_setting('app.institution_user_id',true),'') AND st.status='active')
    AND edrion_petros_v2_source_live(r.institution_id,r.v2_revision->'source'->'binding',r.checksum,true))));
CREATE UNIQUE INDEX IF NOT EXISTS m3_proposal_command_uq ON petros_document_preparations(institution_id,(request_context->>'commandId'))
 WHERE generator_version='petros.m3.proposal.v1';
CREATE INDEX IF NOT EXISTS m3_proposal_version_idx ON petros_document_preparations(institution_id,requested_concept_id,((document_map->>'version')::integer) DESC) WHERE generator_version='petros.m3.proposal.v1';
CREATE OR REPLACE FUNCTION m3_preparation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.generator_version='petros.m3.proposal.v1' THEN RAISE EXCEPTION 'M3_PROPOSAL_REVISION_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS m3_preparation_immutable ON petros_document_preparations;
CREATE TRIGGER m3_preparation_immutable BEFORE UPDATE OR DELETE ON petros_document_preparations FOR EACH ROW EXECUTE FUNCTION m3_preparation_immutable();
-- Private preparation uses the existing candidate owner, with current subject-qualified staff RLS.
CREATE OR REPLACE FUNCTION m3_private_authorized(i uuid,c uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(i::text=edrion_current_institution() AND edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL
 AND EXISTS(SELECT 1 FROM petros_reviewer_qualifications q JOIN courses co ON co.id=c AND co.institution_id=i
 JOIN institution_users u ON u.id=q.reviewer_user_id AND u.institution_id=i
 JOIN staff st ON st.id=q.reviewer_staff_id AND st.institution_user_id=u.id AND st.institution_id=i
 WHERE q.institution_id=i AND q.reviewer_user_id::text=nullif(current_setting('app.institution_user_id',true),'')
 AND co.subject_id::text=q.subject_key AND co.status='active' AND q.status='active' AND q.valid_from<=now() AND q.valid_until>now()
 AND u.status='active' AND u.disabled_at IS NULL AND u.password_reset_required_at IS NULL AND st.status='active'
 AND NOT (u.direct_denies ? '*' OR u.direct_denies ? 'academics.alignments.approve')
 AND NOT EXISTS(SELECT 1 FROM petros_reviewer_qualifications newer WHERE newer.qualification_id=q.qualification_id AND newer.qualification_version>q.qualification_version)),false)
$$;
REVOKE ALL ON FUNCTION m3_private_authorized(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION m3_private_authorized(uuid,uuid) TO edrion_app;
DROP POLICY IF EXISTS m3_private_candidate_guard ON petros_teaching_pack_candidates;
CREATE POLICY m3_private_candidate_guard ON petros_teaching_pack_candidates AS RESTRICTIVE FOR ALL TO edrion_app
 USING(schema_version<>'petros.v2.private-verification-candidate.v1' OR m3_private_authorized(institution_id,course_id))
 WITH CHECK(schema_version<>'petros.v2.private-verification-candidate.v1' OR m3_private_authorized(institution_id,course_id));
DROP POLICY IF EXISTS m3_private_review_guard ON petros_teaching_pack_reviews;
CREATE POLICY m3_private_review_guard ON petros_teaching_pack_reviews AS RESTRICTIVE FOR ALL TO edrion_app
 USING(source_format='v1' OR receipt->>'dimension'<>'assessment_instrument' OR m3_private_authorized(institution_id,course_id))
 WITH CHECK(source_format='v1' OR receipt->>'dimension'<>'assessment_instrument' OR m3_private_authorized(institution_id,course_id));
-- Read-only, bounded projection. This delegates source entitlement to the existing owner; it never returns private bodies or hashes.
-- A security-barrier projection view hides private columns while preserving the CALLER identity for
-- the existing source-live function (which correctly requires current_user=edrion_app).
-- Only this projection has owner read privileges; current source/tenant/staff checks remain mandatory.
CREATE OR REPLACE VIEW m3_private_status_projection WITH(security_barrier=true) AS
 WITH current_proposal AS (
 SELECT pc.* FROM public.petros_teaching_pack_candidates pc JOIN public.petros_document_source_revisions sr ON sr.id=pc.source_revision_id AND sr.institution_id=pc.institution_id
 WHERE pc.institution_id::text=public.edrion_current_institution() AND public.edrion_current_student() IS NULL AND public.edrion_current_independent_user() IS NULL
 AND pc.schema_version='petros.v2.learning-proposal.v1'
 AND EXISTS(SELECT 1 FROM public.institution_users u JOIN public.staff st ON st.institution_user_id=u.id AND st.institution_id=pc.institution_id
  WHERE u.id::text=nullif(current_setting('app.institution_user_id',true),'') AND u.institution_id=pc.institution_id AND u.status='active'
   AND u.disabled_at IS NULL AND u.password_reset_required_at IS NULL AND st.status='active')
 AND public.edrion_petros_v2_source_live(pc.institution_id,sr.v2_revision->'source'->'binding',sr.checksum,true)
 AND NOT EXISTS(SELECT 1 FROM public.petros_document_preparations n WHERE n.institution_id=pc.institution_id AND n.requested_concept_id=pc.pack_id::text
  AND n.generator_version='petros.m3.proposal.v1' AND (n.document_map->>'version')::integer>pc.pack_version)
 ), families AS (
 SELECT p.*,t->>'id' AS fid FROM current_proposal p CROSS JOIN LATERAL jsonb_array_elements(p.payload->'taskCandidates') t
 WHERE t->>'kind'<>'formative_practice'
 )
 SELECT f.institution_id,f.pack_id AS proposal_id,f.pack_version AS proposal_version,
 c.pack_id AS family_id,c.pack_version AS family_version,(c.payload->>'proposalId'=f.pack_id::text AND c.payload->>'proposalVersion'=f.pack_version::text
  AND c.payload->>'proposalHash'=f.payload_hash AND c.source_revision_id=f.source_revision_id AND c.source_version=f.source_version) AS context_current,
 r.id AS review_id,r.decision,r.reviewer_user_id,r.qualification_id,r.qualification_version,
 EXISTS(SELECT 1 FROM public.petros_teaching_pack_review_revocations v WHERE v.institution_id=f.institution_id AND v.review_id=r.id) AS revoked
 FROM families f JOIN LATERAL (SELECT * FROM public.petros_teaching_pack_candidates c WHERE c.institution_id=f.institution_id
  AND c.pack_id::text=f.fid AND c.schema_version='petros.v2.private-verification-candidate.v1' ORDER BY c.pack_version DESC LIMIT 1) c ON true
 LEFT JOIN LATERAL (SELECT r.* FROM public.petros_teaching_pack_reviews r WHERE r.institution_id=f.institution_id AND r.candidate_id=f.id
  AND r.receipt->>'dimension'='assessment_instrument' AND r.receipt->'taskFamily'->>'id'=c.pack_id::text
  AND r.receipt->'taskFamily'->>'version'=c.pack_version::text AND r.receipt->'taskFamily'->>'hash'=c.payload_hash
  ORDER BY r.review_version DESC LIMIT 1) r ON true;
REVOKE ALL ON m3_private_status_projection FROM PUBLIC;
GRANT SELECT ON m3_private_status_projection TO edrion_app;
CREATE OR REPLACE FUNCTION m3_private_public_status(i uuid,pid uuid,pv integer)
 RETURNS TABLE(family_id uuid,family_version integer,context_current boolean,review_id uuid,decision text,
 reviewer_user_id uuid,qualification_id uuid,qualification_version integer,revoked boolean)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT family_id,family_version,context_current,review_id,decision,reviewer_user_id,qualification_id,qualification_version,revoked
 FROM public.m3_private_status_projection WHERE institution_id=i AND proposal_id=pid AND proposal_version=pv LIMIT 12;
$$;
REVOKE ALL ON FUNCTION m3_private_public_status(uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION m3_private_public_status(uuid,uuid,integer) TO edrion_app;
-- Stronger current qualified V2 authority, scoped to the exact candidate/source/version and current proposal.
CREATE OR REPLACE FUNCTION m3_review_authorized(i uuid,c uuid,q uuid,qv integer,u uuid,r jsonb) RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL
  AND i::text=edrion_current_institution() AND u::text=nullif(current_setting('app.institution_user_id',true),'')
  AND r->>'reviewerUserId'=u::text AND r->>'qualificationId'=q::text AND r->>'qualificationVersion'=qv::text
  AND ((r->>'dimension' IN ('teaching_scope','concepts','activities') AND r->'taskFamily'='null'::jsonb)
   OR (r->>'dimension'='assessment_instrument' AND EXISTS(SELECT 1 FROM petros_teaching_pack_candidates instrument
    WHERE instrument.institution_id=i AND instrument.schema_version='petros.v2.private-verification-candidate.v1'
     AND instrument.pack_id::text=r->'taskFamily'->>'id' AND instrument.pack_version::text=r->'taskFamily'->>'version'
     AND instrument.payload_hash=r->'taskFamily'->>'hash' AND instrument.payload->>'proposalId'=r->>'proposalId'
     AND instrument.payload->>'proposalVersion'=r->>'proposalVersion' AND instrument.payload->>'proposalHash'=r->>'payloadHash'
     AND instrument.source_revision_id::text=r->>'sourceRevisionId' AND instrument.created_by_user_id<>u
     AND (r->>'decision'<>'approved' OR r->>'nonEquivalenceDecision'='distinct')
     AND NOT EXISTS(SELECT 1 FROM petros_teaching_pack_candidates newer WHERE newer.institution_id=i
      AND newer.pack_id=instrument.pack_id AND newer.pack_version>instrument.pack_version))))
  AND EXISTS(SELECT 1 FROM petros_teaching_pack_candidates pc JOIN courses co ON co.id=pc.course_id AND co.institution_id=i
    JOIN petros_reviewer_qualifications qu ON qu.qualification_id=q AND qu.qualification_version=qv AND qu.institution_id=i
    JOIN institution_users iu ON iu.id=u AND iu.institution_id=i JOIN staff st ON st.id=qu.reviewer_staff_id AND st.institution_user_id=u AND st.institution_id=i
    JOIN petros_document_source_revisions sr ON sr.id=pc.source_revision_id AND sr.institution_id=i
    WHERE pc.id=c AND pc.institution_id=i AND pc.source_format='v2' AND pc.schema_version='petros.v2.learning-proposal.v1'
      AND pc.created_by_user_id<>u AND pc.pack_id::text=r->>'proposalId' AND pc.pack_version::text=r->>'proposalVersion' AND pc.payload_hash=r->>'payloadHash'
      AND pc.source_revision_id::text=r->>'sourceRevisionId' AND co.subject_id::text=qu.subject_key AND co.status='active'
      AND qu.reviewer_user_id=u AND qu.status='active' AND qu.valid_from<=now() AND qu.valid_until>now()
      AND iu.status='active' AND iu.disabled_at IS NULL AND iu.password_reset_required_at IS NULL AND st.status='active'
      AND NOT (iu.direct_denies ? '*' OR iu.direct_denies ? 'academics.alignments.approve')
      AND NOT EXISTS(SELECT 1 FROM petros_reviewer_qualifications newer WHERE newer.qualification_id=q AND newer.qualification_version>qv)
      AND edrion_petros_v2_source_live(i,sr.v2_revision->'source'->'binding',sr.checksum,true)
      AND EXISTS(SELECT 1 FROM petros_document_preparations p WHERE p.institution_id=i AND p.requested_concept_id=pc.pack_id::text
        AND p.generator_version='petros.m3.proposal.v1' AND p.document_map->>'version'=pc.pack_version::text AND p.document_map->>'state'='under_review'
        AND NOT EXISTS(SELECT 1 FROM petros_document_preparations newer WHERE newer.institution_id=i AND newer.requested_concept_id=p.requested_concept_id
          AND newer.generator_version=p.generator_version AND (newer.document_map->>'version')::integer>pc.pack_version))),false)
$$;
REVOKE ALL ON FUNCTION m3_review_authorized(uuid,uuid,uuid,integer,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION m3_review_authorized(uuid,uuid,uuid,integer,uuid,jsonb) TO edrion_app;
DROP POLICY IF EXISTS m1_review_release_guard ON petros_teaching_pack_reviews;
CREATE POLICY m1_review_release_guard ON petros_teaching_pack_reviews AS RESTRICTIVE FOR ALL TO edrion_app
 USING (source_format='v1' OR (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL AND institution_id::text=edrion_current_institution()
  AND EXISTS(SELECT 1 FROM petros_document_source_revisions sr WHERE sr.id=source_revision_id AND sr.institution_id=petros_teaching_pack_reviews.institution_id)))
 WITH CHECK(source_format='v1' OR m3_review_authorized(institution_id,candidate_id,qualification_id,qualification_version,reviewer_user_id,receipt));
-- Proposal function uses the existing staff-source reservation with a separate registered task pin.
ALTER TABLE petros_ai_attempt_reservations DROP CONSTRAINT IF EXISTS m2g_reservation_owner;
ALTER TABLE petros_ai_attempt_reservations ADD CONSTRAINT m2g_reservation_owner CHECK (COALESCE((
 (source_context IS NULL AND command_id IS NOT NULL AND session_id IS NOT NULL AND student_id IS NOT NULL)
 OR (source_context IS NOT NULL AND command_id IS NULL AND session_id IS NULL AND student_id IS NULL
  AND source_context->>'kind'='staff_source' AND source_context->>'institutionId'=institution_id::text
  AND source_context->>'requestId'=request_id::text AND source_context->>'fence'=execution_fence::text
  AND source_context->>'stage' IN ('document.understand','teaching.propose')
  AND source_context ?& ARRAY['kind','institutionId','requestId','stage','fence','staffActorId','sourceRevisionId','sourceHash','preparationId','approvalId','interpretationVersion','routeId','providerKey','modelKey','maxSpendMicros','expiresAt'])),false));

-- Existing curriculum record union lacked a versioned V2 scope/release member. Preserve V1 exactly.
ALTER TABLE course_curriculum_records DROP CONSTRAINT IF EXISTS course_curriculum_record_bound;
ALTER TABLE course_curriculum_records ADD CONSTRAINT course_curriculum_record_bound CHECK ((
 (kind IN ('objectives','frameworks','releases','items','relationships','alignments')
  AND jsonb_typeof(content)='object' AND octet_length(content::text)<=32000
  AND content->>'id'=record_id::text AND content->>'version'=record_version::text)
 OR (kind IN ('petros_v2_teaching_scope','petros_v2_concepts','petros_v2_activities','petros_v2_release')
  AND jsonb_typeof(content)='object' AND octet_length(content::text)<=110592
  AND content->>'proposalId'=record_id::text AND content->>'proposalVersion'=record_version::text)
) IS TRUE);
-- M3 records are staff preparation/review manifests, not student publication. Preserve V1 readers.
DROP POLICY IF EXISTS m3_curriculum_staff_guard ON course_curriculum_records;
CREATE POLICY m3_curriculum_staff_guard ON course_curriculum_records AS RESTRICTIVE FOR ALL TO edrion_app
 USING(kind NOT IN ('petros_v2_teaching_scope','petros_v2_concepts','petros_v2_activities','petros_v2_release') OR (
  edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL
  AND institution_id::text=edrion_current_institution() AND EXISTS(
   SELECT 1 FROM petros_teaching_pack_candidates c WHERE c.institution_id=course_curriculum_records.institution_id
    AND c.course_id=course_curriculum_records.course_id AND c.pack_id=course_curriculum_records.record_id
    AND c.pack_version=course_curriculum_records.record_version AND c.payload_hash=course_curriculum_records.content_hash
    AND c.schema_version='petros.v2.learning-proposal.v1')))
 WITH CHECK(kind NOT IN ('petros_v2_teaching_scope','petros_v2_concepts','petros_v2_activities','petros_v2_release') OR (
  edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL
  AND institution_id::text=edrion_current_institution() AND EXISTS(
   SELECT 1 FROM petros_teaching_pack_candidates c WHERE c.institution_id=course_curriculum_records.institution_id
    AND c.course_id=course_curriculum_records.course_id AND c.pack_id=course_curriculum_records.record_id
    AND c.pack_version=course_curriculum_records.record_version AND c.payload_hash=course_curriculum_records.content_hash
    AND c.schema_version='petros.v2.learning-proposal.v1')));
CREATE OR REPLACE FUNCTION m3_candidate_pins() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.schema_version='petros.v2.learning-proposal.v1' AND NOT EXISTS(
  SELECT 1 FROM petros_document_preparations p WHERE p.institution_id=NEW.institution_id
   AND p.source_revision_id=NEW.source_revision_id AND p.requested_concept_id=NEW.pack_id::text
   AND p.generator_version='petros.m3.proposal.v1' AND p.document_map=NEW.payload
   AND p.document_map->>'version'=NEW.pack_version::text AND p.document_map->>'courseId'=NEW.course_id::text
   AND p.document_map->'source'->>'originalHash'=NEW.source_version
   AND p.document_map->>'state'='under_review') THEN RAISE EXCEPTION 'M3_EXACT_PREPARATION_REQUIRED'; END IF;
 IF NEW.schema_version='petros.v2.private-verification-candidate.v1' THEN
  IF NEW.created_by_user_id::text IS DISTINCT FROM nullif(current_setting('app.institution_user_id',true),'')
   OR NEW.payload->>'id' IS DISTINCT FROM NEW.pack_id::text OR NEW.payload->>'version' IS DISTINCT FROM NEW.pack_version::text
   OR NEW.payload->>'institutionId' IS DISTINCT FROM NEW.institution_id::text OR NEW.payload->>'courseId' IS DISTINCT FROM NEW.course_id::text
   OR NEW.payload->>'sourceRevisionId' IS DISTINCT FROM NEW.source_revision_id::text OR NEW.payload->>'sourceHash' IS DISTINCT FROM NEW.source_version
   OR octet_length(NEW.payload::text)>65536 OR NOT EXISTS(
    SELECT 1 FROM petros_teaching_pack_candidates pc JOIN petros_document_preparations p ON p.institution_id=pc.institution_id
     AND p.requested_concept_id=pc.pack_id::text AND p.generator_version='petros.m3.proposal.v1' AND p.document_map=pc.payload
    WHERE pc.institution_id=NEW.institution_id AND pc.course_id=NEW.course_id AND pc.schema_version='petros.v2.learning-proposal.v1'
     AND pc.pack_id::text=NEW.payload->>'proposalId' AND pc.pack_version::text=NEW.payload->>'proposalVersion'
     AND pc.payload_hash=NEW.payload->>'proposalHash' AND pc.source_revision_id=NEW.source_revision_id AND pc.source_version=NEW.source_version
     AND p.document_map->>'state'='under_review' AND pc.payload->>'subjectId'=NEW.payload->>'subjectId'
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(pc.payload->'taskCandidates') t
      WHERE t->>'id'=NEW.pack_id::text AND t->>'kind'=NEW.payload->>'kind' AND t->>'kind'<>'formative_practice'
       AND t->>'objectiveId'=NEW.payload->>'objectiveId')
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(pc.payload->'objectives') o WHERE o->>'id'=NEW.payload->>'objectiveId'
      AND o->>'version'=NEW.payload->>'objectiveVersion')
     AND jsonb_array_length(NEW.payload->'support') BETWEEN 1 AND 4
     AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.payload->'support') evidence
      WHERE NOT EXISTS(SELECT 1 FROM petros_content_units cu WHERE cu.institution_id=NEW.institution_id AND cu.source_revision_id=NEW.source_revision_id
       AND cu.id::text=evidence->'reference'->>'unitId' AND cu.content_hash=evidence->'reference'->>'unitHash'
       AND cu.manifest->'locator'=evidence->'reference'->'locator' AND cu.manifest->>'sourceHash'=evidence->'reference'->>'sourceHash'
       AND position(evidence->>'quote' in cu.searchable_text)>0
       AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(pc.payload->'source'->'references') ref WHERE ref->>'unitId'=cu.id::text)))
     AND NOT EXISTS(SELECT 1 FROM petros_document_preparations n WHERE n.institution_id=pc.institution_id AND n.requested_concept_id=pc.pack_id::text
      AND n.generator_version=p.generator_version AND (n.document_map->>'version')::integer>pc.pack_version))
  THEN RAISE EXCEPTION 'M3_PRIVATE_CURRENT_SOURCE_PINS_REQUIRED'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS m3_candidate_pins ON petros_teaching_pack_candidates;
CREATE TRIGGER m3_candidate_pins BEFORE INSERT ON petros_teaching_pack_candidates FOR EACH ROW EXECUTE FUNCTION m3_candidate_pins();
CREATE OR REPLACE FUNCTION m3_curriculum_pins() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c public.petros_teaching_pack_candidates; d text; needed text[]; valid boolean;
BEGIN
 IF NEW.kind NOT LIKE 'petros_v2_%' THEN RETURN NEW; END IF;
 SELECT * INTO c FROM petros_teaching_pack_candidates WHERE institution_id=NEW.institution_id AND course_id=NEW.course_id
  AND pack_id=NEW.record_id AND pack_version=NEW.record_version AND payload_hash=NEW.content_hash AND schema_version='petros.v2.learning-proposal.v1';
 IF c.id IS NULL OR NEW.actor_id::text IS DISTINCT FROM nullif(current_setting('app.institution_user_id',true),'')
  OR NOT EXISTS(SELECT 1 FROM petros_document_preparations p WHERE p.institution_id=NEW.institution_id AND p.requested_concept_id=c.pack_id::text
    AND p.generator_version='petros.m3.proposal.v1' AND p.document_map->>'version'=c.pack_version::text
    AND NOT EXISTS(SELECT 1 FROM petros_document_preparations newer WHERE newer.institution_id=p.institution_id
      AND newer.requested_concept_id=p.requested_concept_id AND newer.generator_version=p.generator_version
      AND (newer.document_map->>'version')::integer>c.pack_version)) THEN RAISE EXCEPTION 'M3_CURRICULUM_CURRENT_CANDIDATE_REQUIRED'; END IF;
 needed:=CASE WHEN NEW.kind='petros_v2_release' THEN ARRAY['teaching_scope','concepts','activities'] ELSE ARRAY[replace(NEW.kind,'petros_v2_','')] END;
 FOREACH d IN ARRAY needed LOOP
  SELECT EXISTS(SELECT 1 FROM petros_teaching_pack_reviews r JOIN petros_reviewer_qualifications q
   ON q.qualification_id=r.qualification_id AND q.qualification_version=r.qualification_version AND q.institution_id=NEW.institution_id
   JOIN institution_users u ON u.id=q.reviewer_user_id AND u.institution_id=NEW.institution_id
   JOIN staff st ON st.id=q.reviewer_staff_id AND st.institution_user_id=u.id AND st.institution_id=NEW.institution_id
   JOIN courses co ON co.id=NEW.course_id AND co.institution_id=NEW.institution_id
   WHERE r.candidate_id=c.id AND r.reviewer_user_id<>c.created_by_user_id AND r.decision='approved' AND r.receipt->>'dimension'=d AND r.payload_hash=c.payload_hash
    AND co.subject_id::text=q.subject_key AND co.status='active' AND q.reviewer_user_id=r.reviewer_user_id AND q.status='active'
    AND q.valid_from<=now() AND q.valid_until>now() AND u.status='active' AND u.disabled_at IS NULL AND u.password_reset_required_at IS NULL AND st.status='active'
    AND NOT (u.direct_denies ? '*' OR u.direct_denies ? 'academics.alignments.approve')
    AND NOT EXISTS(SELECT 1 FROM petros_reviewer_qualifications newer WHERE newer.qualification_id=q.qualification_id AND newer.qualification_version>q.qualification_version)
    AND NOT EXISTS(SELECT 1 FROM petros_teaching_pack_reviews newer WHERE newer.candidate_id=c.id AND newer.receipt->>'dimension'=d AND newer.review_version>r.review_version)
    AND NOT EXISTS(SELECT 1 FROM petros_teaching_pack_review_revocations v WHERE v.review_id=r.id)
    AND CASE WHEN NEW.kind='petros_v2_release' THEN NEW.content->'reviewRefs' @> jsonb_build_array(r.id::text) ELSE NEW.content->>'reviewId'=r.id::text END) INTO valid;
  IF NOT valid THEN RAISE EXCEPTION 'M3_CURRENT_QUALIFIED_REVIEW_REQUIRED'; END IF;
 END LOOP;
 IF NEW.kind='petros_v2_release' THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.content->'instrumentRefs','[]'::jsonb)) pin
   WHERE NOT EXISTS(SELECT 1 FROM m3_private_public_status(NEW.institution_id,c.pack_id,c.pack_version) status
    JOIN petros_reviewer_qualifications q ON q.qualification_id=status.qualification_id AND q.qualification_version=status.qualification_version
     AND q.institution_id=NEW.institution_id
    JOIN institution_users u ON u.id=q.reviewer_user_id AND u.institution_id=q.institution_id
    JOIN staff st ON st.id=q.reviewer_staff_id AND st.institution_user_id=u.id AND st.institution_id=q.institution_id
    WHERE status.family_id::text=pin->>'id' AND status.family_version::text=pin->>'version' AND status.review_id::text=pin->>'receiptId'
     AND status.context_current AND status.decision='approved' AND NOT status.revoked
     AND q.reviewer_user_id=status.reviewer_user_id AND q.status='active' AND q.valid_from<=now() AND q.valid_until>now()
     AND u.status='active' AND u.disabled_at IS NULL AND u.password_reset_required_at IS NULL AND st.status='active'
     AND NOT (u.direct_denies ? '*' OR u.direct_denies ? 'academics.alignments.approve')
     AND NOT EXISTS(SELECT 1 FROM petros_reviewer_qualifications newer WHERE newer.qualification_id=q.qualification_id AND newer.qualification_version>q.qualification_version)))
  THEN RAISE EXCEPTION 'M3_CURRENT_PRIVATE_REVIEW_REQUIRED'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS m3_curriculum_pins ON course_curriculum_records;
CREATE TRIGGER m3_curriculum_pins BEFORE INSERT ON course_curriculum_records FOR EACH ROW EXECUTE FUNCTION m3_curriculum_pins();

CREATE INDEX IF NOT EXISTS m3_private_source_idx ON petros_teaching_pack_candidates(institution_id,source_revision_id)
 WHERE schema_version='petros.v2.private-verification-candidate.v1';

-- Defense against copying a private fragment into an ordinary teaching revision. Source authority is
-- checked as the caller BEFORE the owner-only content guard. Neither function exposes private values.
CREATE OR REPLACE FUNCTION m3_preparation_source_before_privacy() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.generator_version<>'petros.m3.proposal.v1' THEN RETURN NEW; END IF;
 IF NEW.institution_id::text IS DISTINCT FROM edrion_current_institution() OR edrion_current_student() IS NOT NULL
  OR edrion_current_independent_user() IS NOT NULL OR NOT EXISTS(SELECT 1 FROM petros_document_source_revisions sr
   WHERE sr.id=NEW.source_revision_id AND sr.institution_id=NEW.institution_id
   AND edrion_petros_v2_source_live(sr.institution_id,sr.v2_revision->'source'->'binding',sr.checksum,true))
 THEN RAISE EXCEPTION 'M3_SOURCE_UNAVAILABLE'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION m3_preparation_source_before_privacy() FROM PUBLIC;
CREATE OR REPLACE FUNCTION m3_preparation_private_copy_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=off AS $$
DECLARE body text; original_body text; fragment text; c public.petros_teaching_pack_candidates;
BEGIN
 IF NEW.generator_version<>'petros.m3.proposal.v1' THEN RETURN NEW; END IF;
 SELECT lower(regexp_replace(string_agg(v #>> '{}',' '),'[^[:alnum:]]+',' ','g')) INTO body
  FROM jsonb_path_query(NEW.document_map,'strict $.** ? (@.type() == "string")') v;
 FOR c IN SELECT * FROM public.petros_teaching_pack_candidates WHERE institution_id=NEW.institution_id
  AND source_revision_id=NEW.source_revision_id AND schema_version='petros.v2.private-verification-candidate.v1' LOOP
  SELECT lower(regexp_replace(string_agg(v #>> '{}',' '),'[^[:alnum:]]+',' ','g')) INTO original_body
   FROM public.petros_teaching_pack_candidates p CROSS JOIN LATERAL jsonb_path_query(p.payload,'strict $.** ? (@.type() == "string")') v
   WHERE p.institution_id=c.institution_id AND p.schema_version='petros.v2.learning-proposal.v1'
    AND p.pack_id::text=c.payload->>'proposalId' AND p.pack_version::text=c.payload->>'proposalVersion';
  FOR fragment IN SELECT value FROM (
   SELECT c.payload->>'answer' AS value UNION ALL SELECT c.payload->>'privateEvaluationPrompt'
   UNION ALL SELECT jsonb_array_elements_text(c.payload->'referenceAnswers')
   UNION ALL SELECT r->>'privateRule' FROM jsonb_array_elements(c.payload->'rubric') r
   UNION ALL SELECT jsonb_array_elements_text(c.payload->'discriminators')) fragments LOOP
   fragment:=lower(regexp_replace(fragment,'[^[:alnum:]]+',' ','g'));
   -- Already-public wording is not private. Use token boundaries even for short keys;
   -- semantic paraphrases/exposure still require qualified review.
   IF length(trim(fragment))>0 AND position(' '||trim(fragment)||' ' in ' '||COALESCE(original_body,'')||' ')=0
    AND position(' '||trim(fragment)||' ' in ' '||COALESCE(body,'')||' ')>0
   THEN RAISE EXCEPTION 'M3_PRIVATE_CONTENT_IN_TEACHING'; END IF;
  END LOOP;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION m3_preparation_private_copy_guard() FROM PUBLIC;
-- PostgreSQL executes trigger functions without a caller EXECUTE grant; the application cannot invoke
-- the private owner function or change this ordering. The ordinary source/RLS checks are retained.
DROP TRIGGER IF EXISTS m3_a_preparation_source_before_privacy ON petros_document_preparations;
CREATE TRIGGER m3_a_preparation_source_before_privacy BEFORE INSERT ON petros_document_preparations FOR EACH ROW EXECUTE FUNCTION m3_preparation_source_before_privacy();
DROP TRIGGER IF EXISTS m3_b_preparation_private_copy_guard ON petros_document_preparations;
CREATE TRIGGER m3_b_preparation_private_copy_guard BEFORE INSERT ON petros_document_preparations FOR EACH ROW EXECUTE FUNCTION m3_preparation_private_copy_guard();
