-- Replay-safe final M4 ACL/RLS overlay. Default-off; never grants qualifications.
DO $install$ BEGIN IF to_regclass('public.petros_v2_tasks') IS NOT NULL THEN EXECUTE $ddl$
CREATE OR REPLACE FUNCTION m4_owner(i uuid,s uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(i::text=public.edrion_current_institution() AND s::text=public.edrion_current_student()
 AND public.edrion_current_independent_user() IS NULL AND EXISTS(SELECT 1 FROM public.students st JOIN public.institution_users u
 ON u.id=st.institution_user_id AND u.institution_id=st.institution_id
 WHERE st.id=s AND st.institution_id=i AND st.status='enrolled' AND u.status='active' AND u.disabled_at IS NULL
 AND u.id::text=nullif(current_setting('app.institution_user_id',true),'') AND u.password_reset_required_at IS NULL
 AND NOT (u.direct_denies ? '*' OR u.direct_denies ? 'student.learn.use')
 AND EXISTS(SELECT 1 FROM public.institution_user_roles ur WHERE ur.institution_user_id=u.id AND ur.role_key='student')),false)
$$;
REVOKE ALL ON FUNCTION m4_owner(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION m4_owner(uuid,uuid) TO edrion_app;
CREATE OR REPLACE FUNCTION m4_review_live(rid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.petros_teaching_pack_reviews r
 JOIN public.petros_reviewer_qualifications q ON q.qualification_id=r.qualification_id AND q.qualification_version=r.qualification_version AND q.institution_id=r.institution_id
 JOIN public.institution_users u ON u.id=r.reviewer_user_id AND u.institution_id=r.institution_id
 JOIN public.staff st ON st.id=q.reviewer_staff_id AND st.institution_user_id=u.id AND st.institution_id=r.institution_id
 JOIN public.courses co ON co.id=r.course_id AND co.institution_id=r.institution_id
 WHERE r.id=rid AND r.decision='approved' AND q.status='active' AND q.reviewer_user_id=u.id AND q.subject_key=co.subject_id::text
 AND q.valid_from<=now() AND q.valid_until>now() AND u.status='active' AND u.disabled_at IS NULL AND st.status='active'
 AND u.password_reset_required_at IS NULL AND NOT(u.direct_denies ? '*' OR u.direct_denies ? 'academics.alignments.approve')
 AND NOT EXISTS(SELECT 1 FROM public.petros_reviewer_qualifications n WHERE n.qualification_id=q.qualification_id AND n.qualification_version>q.qualification_version)
 AND NOT EXISTS(SELECT 1 FROM public.petros_teaching_pack_review_revocations rv WHERE rv.review_id=r.id)
 AND NOT EXISTS(SELECT 1 FROM public.petros_teaching_pack_reviews n WHERE n.candidate_id=r.candidate_id AND n.review_version>r.review_version
  AND n.receipt->>'dimension'=r.receipt->>'dimension' AND n.receipt->'taskFamily' IS NOT DISTINCT FROM r.receipt->'taskFamily')
 AND EXISTS(SELECT 1 FROM public.institution_user_roles ur WHERE ur.institution_user_id=u.id AND ur.role_key IN ('institution_owner','academic_admin')))
$$;
REVOKE ALL ON FUNCTION m4_review_live(uuid) FROM PUBLIC;
-- Publication projection is bounded and contains explicitly public lesson/task metadata only.
CREATE OR REPLACE FUNCTION m4_publication(pid uuid) RETURNS SETOF public.course_curriculum_records LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT p.* FROM public.course_curriculum_records p
 JOIN public.students st ON st.id::text=public.edrion_current_student() AND st.institution_id=p.institution_id
 JOIN public.courses co ON co.id=p.course_id AND co.institution_id=p.institution_id AND co.status='active'
 WHERE p.id=pid AND p.kind='student_session_release_v2' AND public.m4_owner(p.institution_id,st.id)
 AND st.class_id::text=p.content->>'classId' AND co.subject_id::text=p.content->>'subjectId'
 AND EXISTS(SELECT 1 FROM public.classes cl WHERE cl.id=st.class_id AND cl.institution_id=p.institution_id AND (cl.campus_id IS NULL OR cl.campus_id=st.campus_id))
 AND p.content->'recipientIds' @> jsonb_build_array(st.id::text)
 AND EXISTS(SELECT 1 FROM public.course_enrollments ce WHERE ce.institution_id=p.institution_id AND ce.course_id=p.course_id AND ce.student_id=st.id)
 AND EXISTS(SELECT 1 FROM public.course_curriculum_revisions cr WHERE cr.course_id=p.course_id AND cr.institution_id=p.institution_id
  AND cr.revision::text=p.content->>'curriculumRevision' AND NOT EXISTS(SELECT 1 FROM public.course_curriculum_revisions n WHERE n.course_id=cr.course_id AND n.revision>cr.revision))
 AND EXISTS(SELECT 1 FROM public.petros_teaching_pack_candidates pc WHERE pc.institution_id=p.institution_id AND pc.pack_id=p.record_id
  AND pc.pack_version=p.record_version AND pc.payload_hash=p.content->>'proposalHash'
  AND pc.source_revision_id::text=p.content->>'sourceRevisionId' AND pc.source_version=p.content->>'sourceHash'
  AND NOT EXISTS(SELECT 1 FROM public.petros_document_preparations n WHERE n.institution_id=p.institution_id
    AND n.requested_concept_id=pc.pack_id::text AND n.generator_version='petros.m3.proposal.v1' AND (n.document_map->>'version')::int>pc.pack_version))
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(p.content->'reviews') pin WHERE NOT public.m4_review_live(pin::uuid))
 AND (SELECT count(DISTINCT r.receipt->>'dimension') FROM public.petros_teaching_pack_reviews r
   JOIN public.petros_teaching_pack_candidates c ON c.id=r.candidate_id
   WHERE p.content->'reviews' @> jsonb_build_array(r.id::text) AND c.pack_id=p.record_id AND c.pack_version=p.record_version
    AND c.payload_hash=p.content->>'proposalHash' AND r.receipt->>'dimension' IN ('teaching_scope','concepts','activities'))=3
 AND jsonb_array_length(p.content->'instruments') BETWEEN 1 AND 12
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.content->'instruments') pin WHERE NOT EXISTS(
  SELECT 1 FROM public.petros_teaching_pack_candidates c JOIN public.petros_teaching_pack_reviews r ON r.candidate_id=c.id
  WHERE c.id::text=pin->>'candidateId' AND c.institution_id=p.institution_id AND c.course_id=p.course_id
   AND c.schema_version='petros.v2.m4-private-instrument.v1' AND c.payload_hash=pin->>'hash'
   AND NOT EXISTS(SELECT 1 FROM public.petros_teaching_pack_candidates n WHERE n.institution_id=c.institution_id AND n.pack_id=c.pack_id AND n.pack_version>c.pack_version)
   AND c.payload->>'proposalHash'=p.content->>'proposalHash' AND c.source_revision_id::text=p.content->>'sourceRevisionId'
   AND c.source_version=p.content->>'sourceHash' AND r.id::text=pin->>'reviewId' AND r.payload_hash=c.payload_hash
   AND r.receipt->>'dimension'='assessment_instrument' AND r.reviewer_user_id<>c.created_by_user_id AND public.m4_review_live(r.id)))
 LIMIT 1
$$;
REVOKE ALL ON FUNCTION m4_publication(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION m4_publication(uuid) TO edrion_app;
CREATE OR REPLACE FUNCTION m4_available_publications() RETURNS TABLE(id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT p.id FROM public.course_curriculum_records p WHERE p.institution_id::text=public.edrion_current_institution()
 AND p.kind='student_session_release_v2' AND EXISTS(SELECT 1 FROM public.m4_publication(p.id)) ORDER BY p.created_at DESC LIMIT 50
$$;
REVOKE ALL ON FUNCTION m4_available_publications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION m4_available_publications() TO edrion_app;
CREATE OR REPLACE FUNCTION m4_public_instrument(pid uuid,cid uuid) RETURNS TABLE(public_task jsonb,equivalence_key text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT c.payload->'publicTask',c.payload->>'equivalenceKey' FROM public.petros_teaching_pack_candidates c
 WHERE c.id=cid AND EXISTS(SELECT 1 FROM public.m4_publication(pid) p WHERE p.content->'instruments' @> jsonb_build_array(jsonb_build_object('candidateId',cid::text))) LIMIT 1
$$;
REVOKE ALL ON FUNCTION m4_public_instrument(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION m4_public_instrument(uuid,uuid) TO edrion_app;
CREATE OR REPLACE FUNCTION m4_due_commands() RETURNS TABLE(session_id uuid,requested_by uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT c.session_id,c.requested_by FROM public.petros_session_commands c JOIN public.petros_learning_sessions s ON s.id=c.session_id
 WHERE s.engine_version='v2' AND c.execution_version='petros.m4.evaluation.v1' AND c.execution_attempts<=3
 AND (c.execution_state='queued' OR (c.execution_state='running' AND c.execution_lease_until<now()))
 AND COALESCE(c.next_dispatch_at,now())<=now() ORDER BY c.created_at LIMIT 100
$$;
REVOKE ALL ON FUNCTION m4_due_commands() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION m4_due_commands() TO edrion_app;
-- Private instruments remain unreadable by student/App SQL, including generic candidate APIs.
DROP POLICY IF EXISTS m4_private_guard ON petros_teaching_pack_candidates;
CREATE POLICY m4_private_guard ON petros_teaching_pack_candidates AS RESTRICTIVE FOR ALL TO edrion_app
 USING(schema_version<>'petros.v2.m4-private-instrument.v1' OR (public.edrion_current_student() IS NULL AND EXISTS(SELECT 1 FROM public.courses co JOIN public.petros_reviewer_qualifications q ON q.institution_id=co.institution_id AND q.subject_key=co.subject_id::text WHERE co.id=petros_teaching_pack_candidates.course_id AND co.institution_id=petros_teaching_pack_candidates.institution_id AND q.reviewer_user_id::text=nullif(current_setting('app.institution_user_id',true),'') AND q.status='active' AND q.valid_from<=now() AND q.valid_until>now())))
 WITH CHECK(schema_version<>'petros.v2.m4-private-instrument.v1' OR (public.edrion_current_student() IS NULL AND EXISTS(SELECT 1 FROM public.courses co JOIN public.petros_reviewer_qualifications q ON q.institution_id=co.institution_id AND q.subject_key=co.subject_id::text WHERE co.id=petros_teaching_pack_candidates.course_id AND co.institution_id=petros_teaching_pack_candidates.institution_id AND q.reviewer_user_id::text=nullif(current_setting('app.institution_user_id',true),'') AND q.status='active' AND q.valid_from<=now() AND q.valid_until>now())));
$ddl$; END IF; END $install$;
DO $install$ DECLARE t text; BEGIN IF to_regclass('public.petros_v2_tasks') IS NULL THEN RETURN; END IF;
 FOREACH t IN ARRAY ARRAY['petros_v2_tasks','petros_v2_responses','petros_v2_evaluations'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS m4_owner ON %I',t);
  EXECUTE format('CREATE POLICY m4_owner ON %I FOR ALL TO edrion_app USING(public.m4_owner(institution_id,student_id)) WITH CHECK(public.m4_owner(institution_id,student_id) AND EXISTS(SELECT 1 FROM public.petros_learning_sessions s WHERE s.id=session_id AND s.engine_version=''v2'' AND s.institution_id=institution_id AND s.student_id=student_id))',t);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO edrion_app',t); EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE ON %I FROM edrion_app',t);
  EXECUTE format('DROP TRIGGER IF EXISTS m4_immutable ON %I',t);
  EXECUTE format('CREATE TRIGGER m4_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.edrion_guard_petros_objective_evidence_immutable()',t);
 END LOOP;
 -- Historical M3 proposal can be installed in a disposable fixture after journal rehearsal.
 ALTER TABLE petros_teaching_pack_candidates DROP CONSTRAINT IF EXISTS m1_candidate_source_union;
 ALTER TABLE petros_teaching_pack_candidates ADD CONSTRAINT m1_candidate_source_union CHECK (((source_format='v1' AND source_item_id IS NOT NULL AND source_revision_id IS NULL)
 OR (source_format='v2' AND source_item_id IS NULL AND source_revision_id IS NOT NULL AND schema_version IN
 ('petros.v2.proposal.v1','petros.v2.learning-proposal.v1','petros.v2.private-verification-candidate.v1','petros.v2.m4-private-instrument.v1'))) IS TRUE);
END $install$;
-- Role has no ordinary app membership. Only a separately configured evaluator connection can call the bounded reader.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='edrion_petros_v2_evaluator') THEN CREATE ROLE edrion_petros_v2_evaluator NOLOGIN NOBYPASSRLS NOSUPERUSER; END IF; END $$;
DO $install$ BEGIN IF to_regclass('public.petros_v2_tasks') IS NOT NULL THEN EXECUTE $ddl$
CREATE OR REPLACE FUNCTION m4_private_instrument(tid uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT c.payload FROM public.petros_v2_tasks t JOIN public.petros_teaching_pack_candidates c ON c.id=t.candidate_id
 JOIN public.petros_learning_sessions s ON s.id=t.session_id AND s.engine_version='v2'
 WHERE t.id=tid AND t.session_id::text=nullif(current_setting('app.session_id',true),'')
 AND t.institution_id::text=public.edrion_current_institution() AND t.student_id::text=public.edrion_current_student()
 AND s.v2_state->>'taskId'=t.id::text AND c.payload_hash=t.contract_hash
 AND public.m4_review_live(t.review_id) LIMIT 1
$$;
REVOKE ALL ON FUNCTION m4_private_instrument(uuid) FROM PUBLIC,edrion_app;
GRANT USAGE ON SCHEMA public TO edrion_petros_v2_evaluator;
GRANT EXECUTE ON FUNCTION m4_private_instrument(uuid) TO edrion_petros_v2_evaluator;
$ddl$; END IF; END $install$;
DO $install$ BEGIN IF to_regclass('public.petros_v2_tasks') IS NOT NULL THEN EXECUTE $ddl$
CREATE OR REPLACE FUNCTION m4_historical_publication(sid uuid) RETURNS TABLE(content jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT p.content FROM public.petros_learning_sessions s JOIN public.course_curriculum_records p ON p.id::text=s.v2_state->>'publicationId'
 WHERE s.id=sid AND s.engine_version='v2' AND public.m4_owner(s.institution_id,s.student_id) LIMIT 1
$$;
REVOKE ALL ON FUNCTION m4_historical_publication(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION m4_historical_publication(uuid) TO edrion_app;
$ddl$; END IF; END $install$;
DO $install$ DECLARE expression text; BEGIN IF to_regclass('public.petros_v2_tasks') IS NULL THEN RETURN; END IF;
 SELECT pg_get_expr(conbin,conrelid) INTO expression FROM pg_constraint WHERE conrelid='public.course_curriculum_records'::regclass AND conname='course_curriculum_record_bound';
 IF expression IS NOT NULL AND position('student_session_release_v2' in expression)=0 THEN
  ALTER TABLE course_curriculum_records DROP CONSTRAINT course_curriculum_record_bound;
  EXECUTE 'ALTER TABLE course_curriculum_records ADD CONSTRAINT course_curriculum_record_bound CHECK (('||expression||') OR (kind=''student_session_release_v2'' AND content->>''schemaVersion''=''petros.v2.student-publication.v1'' AND content->>''proposalId''=record_id::text AND content->>''proposalVersion''=record_version::text AND octet_length(content::text)<=98304))';
 END IF;
 EXECUTE $ddl$
CREATE OR REPLACE FUNCTION m4_review_insert(i uuid,cid uuid,qid uuid,qv integer,reviewer uuid,r jsonb) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(public.edrion_current_student() IS NULL AND public.edrion_current_independent_user() IS NULL AND i::text=public.edrion_current_institution()
 AND reviewer::text=nullif(current_setting('app.institution_user_id',true),'') AND r->>'dimension'='assessment_instrument'
 AND EXISTS(SELECT 1 FROM public.petros_teaching_pack_candidates c JOIN public.courses co ON co.id=c.course_id AND co.institution_id=i
  JOIN public.petros_reviewer_qualifications q ON q.institution_id=i AND q.qualification_id=qid AND q.qualification_version=qv AND q.subject_key=co.subject_id::text
  WHERE c.id=cid AND c.institution_id=i AND c.schema_version='petros.v2.m4-private-instrument.v1' AND c.created_by_user_id<>reviewer
   AND q.reviewer_user_id=reviewer AND q.status='active' AND q.valid_from<=now() AND q.valid_until>now()
   AND NOT EXISTS(SELECT 1 FROM public.petros_reviewer_qualifications n WHERE n.qualification_id=qid AND n.qualification_version>qv)
   AND r->'taskFamily'->>'hash'=c.payload_hash AND r->'taskFamily'->>'id'=c.pack_id::text AND r->'taskFamily'->>'version'=c.pack_version::text
   AND r->>'payloadHash'=c.payload->>'proposalHash' AND r->>'proposalId'=c.payload->>'proposalId'
   AND r->>'sourceRevisionId'=c.source_revision_id::text),false)
$$;
REVOKE ALL ON FUNCTION m4_review_insert(uuid,uuid,uuid,integer,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION m4_review_insert(uuid,uuid,uuid,integer,uuid,jsonb) TO edrion_app;
$ddl$;
 IF to_regprocedure('public.m3_review_authorized(uuid,uuid,uuid,integer,uuid,jsonb)') IS NOT NULL THEN
 EXECUTE $ddl$
DROP POLICY IF EXISTS m1_review_release_guard ON petros_teaching_pack_reviews;
CREATE POLICY m1_review_release_guard ON petros_teaching_pack_reviews AS RESTRICTIVE FOR ALL TO edrion_app
 USING(source_format='v1' OR (public.edrion_current_student() IS NULL AND public.edrion_current_independent_user() IS NULL AND institution_id::text=public.edrion_current_institution()
  AND EXISTS(SELECT 1 FROM public.petros_document_source_revisions sr WHERE sr.id=source_revision_id AND sr.institution_id=petros_teaching_pack_reviews.institution_id)))
 WITH CHECK(source_format='v1' OR public.m3_review_authorized(institution_id,candidate_id,qualification_id,qualification_version,reviewer_user_id,receipt)
 OR public.m4_review_insert(institution_id,candidate_id,qualification_id,qualification_version,reviewer_user_id,receipt));
$ddl$;
 END IF;
END $install$;
DO $install$ BEGIN IF to_regclass('public.petros_v2_tasks') IS NOT NULL THEN EXECUTE $ddl$
CREATE OR REPLACE FUNCTION m4_source_sessions(oid uuid) RETURNS TABLE(id uuid,task_id text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT s.id,s.v2_state->>'taskId' FROM public.petros_learning_sessions s JOIN public.course_curriculum_records p ON p.id::text=s.v2_state->>'publicationId'
 WHERE s.engine_version='v2' AND s.status<>'closed' AND public.m4_owner(s.institution_id,s.student_id)
 AND s.v2_state->>'taskId' IS NOT NULL AND s.v2_state->>'responseId' IS NULL AND p.content->'binding'->>'objectId'=oid::text LIMIT 50
$$;
REVOKE ALL ON FUNCTION m4_source_sessions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION m4_source_sessions(uuid) TO edrion_app;
$ddl$; END IF; END $install$;
DO $install$ BEGIN IF to_regclass('public.petros_v2_tasks') IS NOT NULL THEN EXECUTE $ddl$
CREATE OR REPLACE FUNCTION m4_candidate_pins() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE pc public.petros_teaching_pack_candidates;
BEGIN
 IF NEW.schema_version<>'petros.v2.m4-private-instrument.v1' THEN RETURN NEW; END IF;
 IF public.edrion_current_student() IS NOT NULL OR NEW.institution_id::text IS DISTINCT FROM public.edrion_current_institution()
 OR NEW.created_by_user_id::text IS DISTINCT FROM nullif(current_setting('app.institution_user_id',true),'')
 OR NEW.payload->>'id' IS DISTINCT FROM NEW.pack_id::text OR NEW.payload->>'version' IS DISTINCT FROM NEW.pack_version::text
 OR NEW.payload->>'sourceRevisionId' IS DISTINCT FROM NEW.source_revision_id::text OR NEW.payload->>'sourceHash' IS DISTINCT FROM NEW.source_version
 OR octet_length(NEW.payload::text)>65536 THEN RAISE EXCEPTION 'M4_PRIVATE_INSTRUMENT_PINS_REQUIRED'; END IF;
 SELECT * INTO pc FROM public.petros_teaching_pack_candidates c WHERE c.institution_id=NEW.institution_id AND c.course_id=NEW.course_id
 AND c.pack_id::text=NEW.payload->>'proposalId' AND c.pack_version::text=NEW.payload->>'proposalVersion'
 AND c.payload_hash=NEW.payload->>'proposalHash' AND c.schema_version='petros.v2.learning-proposal.v1';
 IF pc.id IS NULL OR pc.source_revision_id<>NEW.source_revision_id OR pc.source_version<>NEW.source_version OR NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(pc.payload->'objectives') o WHERE o->>'id'=NEW.payload->>'objectiveId' AND o->>'version'=NEW.payload->>'objectiveVersion')
 THEN RAISE EXCEPTION 'M4_CURRENT_OBJECTIVE_SOURCE_REQUIRED'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION m4_candidate_pins() FROM PUBLIC;
DROP TRIGGER IF EXISTS m4_candidate_pins ON petros_teaching_pack_candidates;
CREATE TRIGGER m4_candidate_pins BEFORE INSERT ON petros_teaching_pack_candidates FOR EACH ROW EXECUTE FUNCTION m4_candidate_pins();
CREATE OR REPLACE FUNCTION m4_publication_pins() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE pc public.petros_teaching_pack_candidates; explanation text; quoted text;
BEGIN
 IF NEW.kind<>'student_session_release_v2' THEN RETURN NEW; END IF;
 IF public.edrion_current_student() IS NOT NULL OR NEW.institution_id::text IS DISTINCT FROM public.edrion_current_institution()
 OR NEW.actor_id::text IS DISTINCT FROM nullif(current_setting('app.institution_user_id',true),'') THEN RAISE EXCEPTION 'M4_STAFF_PUBLICATION_REQUIRED'; END IF;
 SELECT * INTO pc FROM public.petros_teaching_pack_candidates c WHERE c.institution_id=NEW.institution_id AND c.course_id=NEW.course_id
 AND c.pack_id=NEW.record_id AND c.pack_version=NEW.record_version AND c.payload_hash=NEW.content->>'proposalHash' AND c.schema_version='petros.v2.learning-proposal.v1';
 IF pc.id IS NULL OR NEW.content->'binding' IS DISTINCT FROM pc.payload->'source'->'binding'
 OR NEW.content->>'sourceRevisionId' IS DISTINCT FROM pc.source_revision_id::text OR NEW.content->>'sourceHash' IS DISTINCT FROM pc.source_version
 OR NEW.content->>'courseId' IS DISTINCT FROM pc.course_id::text OR NEW.content->>'classId' IS DISTINCT FROM pc.payload->>'classId'
 OR NEW.content->>'activityId' IS DISTINCT FROM pc.payload->'objectives'->0->>'selectedActivityId'
 OR NEW.content->>'activityVersion' IS DISTINCT FROM pc.pack_version::text
 OR NEW.content->>'subjectId' IS DISTINCT FROM pc.payload->>'subjectId' OR NEW.content->>'curriculumRevision' IS DISTINCT FROM pc.curriculum_revision::text
 OR NEW.content->'lesson'->'objective'->>'id' IS DISTINCT FROM pc.payload->'objectives'->0->>'id'
 OR NEW.content->'lesson'->'objective'->>'version' IS DISTINCT FROM pc.payload->'objectives'->0->>'version'
 OR NEW.content->'lesson'->'objective'->>'label' IS DISTINCT FROM pc.payload->'objectives'->0->>'wording'
 OR NEW.content->'lesson'->'references' IS DISTINCT FROM pc.payload->'source'->'references'
 THEN RAISE EXCEPTION 'M4_EXACT_RELEASE_PINS_REQUIRED'; END IF;
 SELECT string_agg(c.value->>'statement',E'\n\n' ORDER BY c.n) INTO explanation FROM jsonb_array_elements(pc.payload->'claims') WITH ORDINALITY c(value,n)
 WHERE c.value->>'classification'<>'rejected' AND pc.payload->'objectives'->0->'claimIds' @> jsonb_build_array(c.value->>'id');
 SELECT string_agg(c.value->>'quote',E'\n\n' ORDER BY c.n) INTO quoted FROM jsonb_array_elements(pc.payload->'objectives'->0->'support') WITH ORDINALITY c(value,n);
 IF NEW.content->'lesson'->>'explanation' IS DISTINCT FROM COALESCE(NULLIF(explanation,''),quoted)
 OR jsonb_array_length(NEW.content->'reviews')<>3
 OR (SELECT count(DISTINCT r.receipt->>'dimension') FROM public.petros_teaching_pack_reviews r WHERE r.candidate_id=pc.id
  AND NEW.content->'reviews' @> jsonb_build_array(r.id::text) AND r.receipt->>'dimension' IN ('teaching_scope','concepts','activities')
  AND r.reviewer_user_id<>pc.created_by_user_id AND public.m4_review_live(r.id))<>3
 OR jsonb_array_length(NEW.content->'instruments') NOT BETWEEN 1 AND 12
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.content->'instruments') pin WHERE NOT EXISTS(
  SELECT 1 FROM public.petros_teaching_pack_candidates c JOIN public.petros_teaching_pack_reviews r ON r.candidate_id=c.id
  WHERE c.id::text=pin->>'candidateId' AND r.id::text=pin->>'reviewId' AND c.payload_hash=pin->>'hash' AND r.payload_hash=c.payload_hash
   AND c.schema_version='petros.v2.m4-private-instrument.v1' AND c.institution_id=NEW.institution_id AND c.course_id=NEW.course_id
   AND c.payload->>'proposalHash'=pc.payload_hash AND c.payload->'publicCanvas' IS NOT DISTINCT FROM NEW.content->'canvas'
   AND c.payload->>'objectiveId'=NEW.content->'lesson'->'objective'->>'id'
   AND c.created_by_user_id<>r.reviewer_user_id AND r.receipt->>'dimension'='assessment_instrument' AND public.m4_review_live(r.id)))
 THEN RAISE EXCEPTION 'M4_EXACT_PUBLIC_CONTENT_AND_REVIEWS_REQUIRED'; END IF;
 IF jsonb_array_length(NEW.content->'recipientIds') NOT BETWEEN 1 AND 500 OR EXISTS(
  SELECT 1 FROM jsonb_array_elements_text(NEW.content->'recipientIds') recipient WHERE NOT EXISTS(
   SELECT 1 FROM public.students st JOIN public.course_enrollments ce ON ce.student_id=st.id AND ce.institution_id=st.institution_id
   WHERE st.id::text=recipient AND st.institution_id=NEW.institution_id AND st.class_id::text=NEW.content->>'classId'
    AND st.status='enrolled' AND ce.course_id=NEW.course_id)) THEN RAISE EXCEPTION 'M4_CURRENT_RECIPIENTS_REQUIRED'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION m4_publication_pins() FROM PUBLIC;
DROP TRIGGER IF EXISTS m4_publication_pins ON course_curriculum_records;
CREATE TRIGGER m4_publication_pins BEFORE INSERT ON course_curriculum_records FOR EACH ROW EXECUTE FUNCTION m4_publication_pins();
DROP POLICY IF EXISTS m4_intent_guard ON petros_session_intents;
CREATE POLICY m4_intent_guard ON petros_session_intents AS RESTRICTIVE FOR ALL TO edrion_app
 USING(schema_version<>'petros.v2.admission-intent.v1' OR public.m4_owner(institution_id,student_id))
 WITH CHECK(schema_version<>'petros.v2.admission-intent.v1' OR public.m4_owner(institution_id,student_id));
$ddl$; END IF; END $install$;
DO $install$ BEGIN IF to_regclass('public.petros_v2_tasks') IS NOT NULL THEN EXECUTE $ddl$
CREATE OR REPLACE FUNCTION m4_has_pending_assessment() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.petros_learning_sessions s WHERE s.engine_version='v2' AND s.status<>'closed'
 AND public.m4_owner(s.institution_id,s.student_id) AND s.v2_state->>'taskId' IS NOT NULL AND s.v2_state->>'responseId' IS NULL)
$$;
REVOKE ALL ON FUNCTION m4_has_pending_assessment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION m4_has_pending_assessment() TO edrion_app;
$ddl$; END IF; END $install$;
-- Server-only validation metadata. Keys, rubrics, accepted answers and alternatives remain private.
DO $install$ BEGIN IF to_regclass('public.petros_v2_tasks') IS NOT NULL THEN EXECUTE $ddl$
CREATE OR REPLACE FUNCTION m4_criterion_manifest(pid uuid,cid uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_agg(jsonb_build_object('id',criterion->>'id','label',criterion->>'label','checkerKind',criterion->'checker'->>'kind') ORDER BY ordinal)
 FROM public.petros_teaching_pack_candidates c CROSS JOIN LATERAL jsonb_array_elements(c.payload->'criteria') WITH ORDINALITY AS x(criterion,ordinal)
 WHERE c.id=cid AND EXISTS(SELECT 1 FROM public.m4_publication(pid) p WHERE p.content->'instruments' @> jsonb_build_array(jsonb_build_object('candidateId',cid::text)))
$$;
REVOKE ALL ON FUNCTION m4_criterion_manifest(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION m4_criterion_manifest(uuid,uuid) TO edrion_app;
$ddl$; END IF; END $install$;
