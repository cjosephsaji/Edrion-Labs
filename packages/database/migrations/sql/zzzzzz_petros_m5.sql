DO $m5$ BEGIN IF to_regclass('public.petros_concept_beliefs') IS NOT NULL THEN EXECUTE $ddl$
REVOKE ALL ON petros_concept_beliefs FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON petros_concept_beliefs TO edrion_app;
DROP POLICY IF EXISTS m5_belief_owner ON petros_concept_beliefs;
CREATE POLICY m5_belief_owner ON petros_concept_beliefs FOR ALL TO edrion_app
 USING(m4_owner(institution_id,student_id)) WITH CHECK(m4_owner(institution_id,student_id));
-- Evaluator-only immutable work. The normal app cannot ask this function for a reference answer.
CREATE OR REPLACE FUNCTION m5_committed_canvas(rid uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('snapshot',c.snapshot,'expectedHash',r.snapshot_hash,'response',r.response,'responseHash',r.response_hash) FROM public.petros_v2_responses r
 JOIN public.petros_v2_tasks t ON t.id=r.task_id AND t.session_id=r.session_id AND t.institution_id=r.institution_id AND t.student_id=r.student_id
 JOIN public.petros_workspace_checkpoints c ON c.id=r.checkpoint_id AND c.institution_id=r.institution_id AND c.student_id=r.student_id
 JOIN public.petros_learning_sessions s ON s.id=r.session_id AND s.engine_version='v2'
 WHERE r.id=rid AND r.response->>'kind'='canvas_snapshot'
 AND r.session_id::text=nullif(current_setting('app.session_id',true),'')
 AND r.institution_id::text=public.edrion_current_institution() AND r.student_id::text=public.edrion_current_student()
 AND s.v2_state->>'responseId'=r.id::text AND public.m4_review_live(t.review_id)
 AND (c.snapshot->'canvas'->'invitation'->>'submitted')::boolean=true LIMIT 1
$$;
REVOKE ALL ON FUNCTION m5_committed_canvas(uuid) FROM PUBLIC,edrion_app;
GRANT EXECUTE ON FUNCTION m5_committed_canvas(uuid) TO edrion_petros_v2_evaluator;
-- The released public teaching plan must be the exact portion of the independently reviewed instrument.
CREATE OR REPLACE FUNCTION m5_public_teaching_pins() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF NEW.kind='student_session_release_v2' AND EXISTS(
   SELECT 1 FROM jsonb_array_elements(NEW.content->'instruments') pin
   JOIN public.petros_teaching_pack_candidates c ON c.id::text=pin->>'candidateId'
   WHERE pin->'teaching' IS DISTINCT FROM c.payload->'teaching')
 THEN RAISE EXCEPTION 'M5_EXACT_REVIEWED_TEACHING_REQUIRED'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION m5_public_teaching_pins() FROM PUBLIC;
DROP TRIGGER IF EXISTS m5_public_teaching_pins ON course_curriculum_records;
CREATE TRIGGER m5_public_teaching_pins BEFORE INSERT ON course_curriculum_records
 FOR EACH ROW EXECUTE FUNCTION m5_public_teaching_pins();

$ddl$; END IF; END $m5$;
