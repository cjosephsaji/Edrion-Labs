-- Engineering releases are content-free indexes, never pilot approval or learner scores.
CREATE TABLE petros_release_evaluations (
 id uuid PRIMARY KEY, digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'), report jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(report->>'schemaVersion'='petros.production-quality.v1' AND report->>'environment'='disposable_synthetic'
  AND report->>'runtime'='production_owners' AND report->>'educatorAcceptance'='pending'
  AND report->>'pilotAcceptance'='pending' AND octet_length(report::text)<=32000)
);
CREATE TABLE petros_release_bundles (
 id uuid PRIMARY KEY, digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 evaluation_id uuid NOT NULL REFERENCES petros_release_evaluations(id), manifest jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(manifest->>'schemaVersion'='petros.release-bundle.v1' AND manifest->>'admissions'='disabled'
  AND manifest->>'externalAcceptance'='pending' AND octet_length(manifest::text)<=64000)
);
CREATE TABLE petros_release_disables (
 id uuid PRIMARY KEY, release_id uuid NOT NULL UNIQUE REFERENCES petros_release_bundles(id),
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE petros_pilot_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id),
 student_id uuid NOT NULL, event_id uuid NOT NULL, digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 experiment text NOT NULL CHECK(experiment ~ '^[a-z0-9][a-z0-9._-]{2,79}$'),
 cohort text NOT NULL CHECK(cohort IN ('comparison','candidate')), event jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 journey_id uuid GENERATED ALWAYS AS ((event->>'journeyId')::uuid) STORED NOT NULL,
 FOREIGN KEY(student_id,institution_id) REFERENCES students(id,institution_id),
 FOREIGN KEY(journey_id,institution_id,student_id) REFERENCES petros_journeys(id,institution_id,student_id),
 UNIQUE(institution_id,student_id,event_id),
 CHECK(event->>'schemaVersion'='petros.pilot-event.v1' AND event->>'eventId'=event_id::text
  AND event->>'experiment'=experiment AND octet_length(event::text)<=1024
  AND event->>'event' IN ('lesson_ready','resume_succeeded','recovery_shown','independent_check','review_due','accessibility_alternative')
  AND event->>'outcome' IN ('succeeded','unavailable','declined')
  AND event->>'connectivity' IN ('online','low_bandwidth','intermittent')
  AND (event->>'durationBucket' IS NULL OR event->>'durationBucket' IN ('under_1s','1_to_5s','5_to_30s','over_30s'))
  AND event - ARRAY['schemaVersion','eventId','journeyId','experiment','event','outcome','durationBucket','connectivity']='{}'::jsonb)
);
--> statement-breakpoint
CREATE FUNCTION petros_phase5_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'Petros engineering evidence is immutable' USING ERRCODE='42501'; END;
$$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['petros_release_evaluations','petros_release_bundles','petros_release_disables','petros_pilot_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE TRIGGER petros_phase5_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION petros_phase5_immutable()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['petros_release_evaluations','petros_release_bundles','petros_release_disables'] LOOP
  EXECUTE format('CREATE POLICY petros_phase5_platform ON %I FOR ALL USING(edrion_current_institution() IS NULL AND edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL) WITH CHECK(edrion_current_institution() IS NULL AND edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)',t);
 END LOOP;
END $$;
CREATE POLICY petros_phase5_owner ON petros_pilot_events FOR ALL USING (
 (edrion_current_institution()=institution_id::text AND edrion_current_student()=student_id::text AND edrion_current_independent_user() IS NULL)
 OR (edrion_current_institution() IS NULL AND edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
) WITH CHECK(edrion_current_institution()=institution_id::text AND edrion_current_student()=student_id::text AND edrion_current_independent_user() IS NULL);
GRANT SELECT,INSERT ON petros_release_evaluations,petros_release_bundles,petros_release_disables,petros_pilot_events TO edrion_app;
REVOKE UPDATE,DELETE,TRUNCATE ON petros_release_evaluations,petros_release_bundles,petros_release_disables,petros_pilot_events FROM edrion_app;
--> statement-breakpoint
-- Content-free runtime projection; preserves the gateway's student RLS scope.
CREATE FUNCTION edrion_petros_runtime_release(fn uuid, candidate uuid) RETURNS TABLE(manifest jsonb, digest text, report jsonb, report_digest text, disabled boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Release projection owner requires BYPASSRLS' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT b.manifest,b.digest,e.report,e.digest,EXISTS(SELECT 1 FROM petros_release_disables d WHERE d.release_id=b.id)
 FROM petros_release_bundles b JOIN petros_release_evaluations e ON e.id=b.evaluation_id
 WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(b.manifest->'functions') f WHERE f->>'functionId'=fn::text AND (f->>'versionId'=candidate::text OR f->>'rollbackVersionId'=candidate::text))
 ORDER BY b.created_at DESC,b.id LIMIT 1;
END $$;
REVOKE ALL ON FUNCTION edrion_petros_runtime_release(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION edrion_petros_runtime_release(uuid,uuid) TO edrion_app;
--> statement-breakpoint
-- Platform-only fixed aggregates. No owner IDs, arbitrary predicates or private content.
CREATE FUNCTION edrion_petros_operations() RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE snapshot jsonb; since timestamptz := now()-interval '24 hours';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Operational aggregate owner requires BYPASSRLS' USING ERRCODE='42501';
 END IF;
 IF edrion_current_institution() IS NOT NULL OR edrion_current_student() IS NOT NULL OR edrion_current_independent_user() IS NOT NULL THEN
  RAISE EXCEPTION 'Platform aggregate scope required' USING ERRCODE='42501';
 END IF;
 SELECT jsonb_build_object(
  'questionWork',(SELECT jsonb_build_object(
   'queued',count(*) FILTER(WHERE execution_version IS NOT NULL AND execution_state='queued'),
   'running',count(*) FILTER(WHERE execution_version IS NOT NULL AND execution_state='running'),
   'expiredLeases',count(*) FILTER(WHERE execution_version IS NOT NULL AND execution_state='running' AND execution_lease_until<=now()),
   'pendingDispatch',count(*) FILTER(WHERE execution_version IS NOT NULL AND execution_state IN ('queued','running') AND next_dispatch_at<=now())) FROM petros_session_commands),
  'preparationWork',(SELECT jsonb_build_object(
   'queued',count(*) FILTER(WHERE state='queued'),
   'running',count(*) FILTER(WHERE state IN ('running','processing')),
   'expiredLeases',count(*) FILTER(WHERE state IN ('queued','running','processing') AND lease_until<=now()),
   'pendingDispatch',count(*) FILTER(WHERE state IN ('queued','running','processing') AND next_dispatch_at<=now())) FROM knowledge_preparations),
  'reservations',(SELECT jsonb_build_object(
   'createdLast24Hours',count(*) FILTER(WHERE created_at>=since),
   'outstandingAllTime',count(*) FILTER(WHERE state='reserved'),
   'settledLast24Hours',count(*) FILTER(WHERE state='settled' AND settled_at>=since),
   'ambiguousLast24Hours',count(*) FILTER(WHERE state='ambiguous' AND settled_at>=since),
   'reservedMicros',coalesce(sum(reserved_micros) FILTER(WHERE state='reserved'),0)) FROM petros_ai_attempt_reservations),
  'commandCancellations',(SELECT count(*) FROM petros_session_commands WHERE created_at>=since AND execution_state='cancelled'),
  'admissions',(SELECT jsonb_build_object(
   'safety_resource_limit',count(*) FILTER(WHERE admission_denial->>'category'='safety_resource_limit'),
   'product_plan_allowance',count(*) FILTER(WHERE admission_denial->>'category'='product_plan_allowance'),
   'abuse_control',count(*) FILTER(WHERE admission_denial->>'category'='abuse_control'),
   'pedagogical_attempt_policy',count(*) FILTER(WHERE admission_denial->>'category'='pedagogical_attempt_policy'),
   'other',count(*) FILTER(WHERE admission_denial->>'category' IS NULL OR admission_denial->>'category' NOT IN ('safety_resource_limit','product_plan_allowance','abuse_control','pedagogical_attempt_policy')))
   FROM petros_session_commands WHERE created_at>=since AND admission_denial IS NOT NULL)
 ) INTO snapshot;
 RETURN snapshot;
END $$;
REVOKE ALL ON FUNCTION edrion_petros_operations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION edrion_petros_operations() TO edrion_app;
