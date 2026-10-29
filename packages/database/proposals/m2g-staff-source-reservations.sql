ALTER TABLE petros_ai_attempt_reservations
  ALTER COLUMN command_id DROP NOT NULL,
  ALTER COLUMN session_id DROP NOT NULL,
  ALTER COLUMN student_id DROP NOT NULL,
  ADD COLUMN source_context jsonb;

ALTER TABLE petros_ai_attempt_reservations ADD CONSTRAINT m2g_reservation_owner CHECK (COALESCE((
  (source_context IS NULL AND command_id IS NOT NULL AND session_id IS NOT NULL AND student_id IS NOT NULL)
  OR (source_context IS NOT NULL AND command_id IS NULL AND session_id IS NULL AND student_id IS NULL
    AND source_context->>'kind' = 'staff_source'
    AND source_context->>'institutionId' = institution_id::text
    AND source_context->>'requestId' = request_id::text
    AND source_context->>'stage' = 'document.understand'
    AND source_context->>'fence' = execution_fence::text
    AND source_context ?& ARRAY['kind','institutionId','requestId','stage','fence','staffActorId','sourceRevisionId','sourceHash','preparationId','approvalId',
      'interpretationVersion','routeId','providerKey','modelKey','maxSpendMicros','expiresAt'])
),false));
CREATE UNIQUE INDEX m2g_staff_request_uniq ON petros_ai_attempt_reservations(institution_id,request_id,function_id)
  WHERE source_context IS NOT NULL;

CREATE POLICY m2g_staff_reservation_owner ON petros_ai_attempt_reservations
  FOR ALL TO edrion_app USING (
    source_context IS NOT NULL AND institution_id::text = edrion_current_institution()
    AND edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL
    AND source_context->>'staffActorId' = nullif(current_setting('app.institution_user_id',true),'')
  ) WITH CHECK (
    source_context IS NOT NULL AND institution_id::text = edrion_current_institution()
    AND edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL
    AND source_context->>'staffActorId' = nullif(current_setting('app.institution_user_id',true),'')
  );

CREATE POLICY m2g_staff_reservation_insert ON petros_ai_attempt_reservations
  AS RESTRICTIVE FOR INSERT TO edrion_app WITH CHECK (
    source_context IS NULL OR EXISTS (
      SELECT 1 FROM knowledge_preparations p JOIN petros_document_source_revisions r
        ON r.id::text = source_context->>'sourceRevisionId' AND r.institution_id = p.institution_id
      WHERE p.id::text = source_context->>'preparationId' AND p.institution_id = petros_ai_attempt_reservations.institution_id
        AND p.requested_by::text = source_context->>'staffActorId'
        AND p.operation_version = 'v2' AND p.state = 'succeeded'
        AND p.fence = execution_fence AND p.m2_progress->>'revisionId' = r.id::text
        AND r.checksum = source_context->>'sourceHash' AND p.source_binding = r.v2_revision->'source'->'binding'
        AND edrion_petros_v2_source_live(r.institution_id,p.source_binding,r.checksum,true)
    )
  );

DO $$
DECLARE original_using text; original_check text; staff_predicate text;
BEGIN
  SELECT pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)
    INTO original_using,original_check FROM pg_policy
    WHERE polrelid='public.petros_ai_attempt_reservations'::regclass AND polname='m0r_owner_guard';
  IF original_using IS NULL OR original_check IS NULL THEN RAISE EXCEPTION 'M2G_OWNER_GUARD_REQUIRED'; END IF;
  staff_predicate := 'current_user=''edrion_app'' AND source_context IS NOT NULL AND institution_id::text=public.edrion_current_institution()
    AND public.edrion_current_student() IS NULL AND public.edrion_current_independent_user() IS NULL
    AND source_context->>''staffActorId''=nullif(current_setting(''app.institution_user_id'',true),'''')';
  EXECUTE format('ALTER POLICY m0r_owner_guard ON public.petros_ai_attempt_reservations USING ((%s) OR (%s)) WITH CHECK ((%s) OR (%s))',
    original_using,staff_predicate,original_check,staff_predicate);
  SELECT pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)
    INTO original_using,original_check FROM pg_policy
    WHERE polrelid='public.petros_ai_usage_events'::regclass AND polname='m0r_owner_guard';
  IF original_using IS NULL OR original_check IS NULL THEN RAISE EXCEPTION 'M2G_USAGE_GUARD_REQUIRED'; END IF;
  staff_predicate := 'current_user=''edrion_app'' AND student_id IS NULL AND independent_user_id IS NULL
    AND institution_id::text=public.edrion_current_institution() AND EXISTS(SELECT 1 FROM public.petros_ai_attempt_reservations r
      WHERE r.id=petros_ai_usage_events.budget_reservation_id AND r.source_context IS NOT NULL
        AND r.institution_id=petros_ai_usage_events.institution_id AND r.request_id=petros_ai_usage_events.request_id
        AND r.function_id=petros_ai_usage_events.function_id AND r.provider_id=petros_ai_usage_events.provider_id
        AND r.model_id=petros_ai_usage_events.model_id)';
  EXECUTE format('ALTER POLICY m0r_owner_guard ON public.petros_ai_usage_events USING ((%s) OR (%s)) WITH CHECK ((%s) OR (%s))',
    original_using,staff_predicate,original_check,staff_predicate);
  EXECUTE format('CREATE POLICY m2g_staff_usage ON public.petros_ai_usage_events FOR ALL TO edrion_app USING (%s) WITH CHECK (%s)',
    staff_predicate,staff_predicate);
END $$;

CREATE FUNCTION m2g_source_reservation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.source_context IS NOT NULL OR NEW.source_context IS NOT NULL) AND
    (to_jsonb(OLD)-ARRAY['state','settled_micros','settled_at','provider_dispatched_at']) IS DISTINCT FROM
    (to_jsonb(NEW)-ARRAY['state','settled_micros','settled_at','provider_dispatched_at']) THEN
    RAISE EXCEPTION 'M2G_RESERVATION_IDENTITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER m2g_source_reservation_immutable BEFORE UPDATE ON petros_ai_attempt_reservations
  FOR EACH ROW EXECUTE FUNCTION m2g_source_reservation_immutable();

CREATE FUNCTION edrion_petros_source_budget_snapshot(p_reservation uuid)
RETURNS TABLE(global_daily bigint,global_monthly bigint,provider_daily bigint,provider_monthly bigint,
  function_daily_requests bigint,function_monthly_requests bigint,institution_monthly_requests bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public SET row_security = off AS $$
DECLARE
  owner_row public.petros_ai_attempt_reservations;
  day_start timestamptz := date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  month_start timestamptz := date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  SELECT * INTO owner_row FROM public.petros_ai_attempt_reservations WHERE id = p_reservation;
  IF owner_row.id IS NULL OR owner_row.source_context IS NULL OR owner_row.state <> 'reserved'
    OR owner_row.institution_id::text IS DISTINCT FROM public.edrion_current_institution()
    OR public.edrion_current_student() IS NOT NULL OR public.edrion_current_independent_user() IS NOT NULL
    OR owner_row.source_context->>'staffActorId' IS DISTINCT FROM nullif(current_setting('app.institution_user_id',true),'')
    OR NOT EXISTS(SELECT 1 FROM public.institution_users u WHERE u.id::text = owner_row.source_context->>'staffActorId'
      AND u.institution_id = owner_row.institution_id AND u.status = 'active' AND u.disabled_at IS NULL
      AND u.password_reset_required_at IS NULL) THEN
    RAISE EXCEPTION 'PETROS_SOURCE_BUDGET_SCOPE_INVALID';
  END IF;
  RETURN QUERY WITH charges AS (
    SELECT u.created_at,u.function_id,u.provider_id,u.institution_id,u.request_id,
      coalesce(u.actual_cost_micros,u.estimated_cost_micros) AS amount
    FROM public.petros_ai_usage_events u WHERE u.created_at >= month_start
    UNION ALL
    SELECT greatest(r.created_at,day_start),r.function_id,r.provider_id,r.institution_id,r.request_id,r.reserved_micros
    FROM public.petros_ai_attempt_reservations r WHERE r.state = 'reserved'
  ), requests AS (
    SELECT u.created_at,u.function_id,u.institution_id,u.request_id
    FROM public.petros_ai_usage_events u WHERE u.created_at >= month_start
    UNION ALL
    SELECT r.created_at,r.function_id,r.institution_id,r.request_id
    FROM public.petros_ai_attempt_reservations r WHERE r.created_at >= month_start
  ) SELECT
    coalesce((SELECT sum(c.amount) FROM charges c WHERE c.created_at >= day_start),0)::bigint,
    coalesce((SELECT sum(c.amount) FROM charges c),0)::bigint,
    coalesce((SELECT sum(c.amount) FROM charges c WHERE c.provider_id = owner_row.provider_id AND c.created_at >= day_start),0)::bigint,
    coalesce((SELECT sum(c.amount) FROM charges c WHERE c.provider_id = owner_row.provider_id),0)::bigint,
    (SELECT count(DISTINCT q.request_id) FROM requests q WHERE q.function_id = owner_row.function_id AND q.created_at >= day_start)::bigint,
    (SELECT count(DISTINCT q.request_id) FROM requests q WHERE q.function_id = owner_row.function_id)::bigint,
    (SELECT count(DISTINCT q.request_id) FROM requests q WHERE q.institution_id = owner_row.institution_id)::bigint;
END $$;
REVOKE ALL ON FUNCTION edrion_petros_source_budget_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION edrion_petros_source_budget_snapshot(uuid) TO edrion_app;
