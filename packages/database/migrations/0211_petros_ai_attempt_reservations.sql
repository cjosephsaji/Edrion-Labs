-- Additive accounting for durable document-question provider attempts.
ALTER TABLE petros_ai_usage_events
  ADD COLUMN budget_reservation_id uuid;

CREATE TABLE petros_ai_attempt_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id uuid NOT NULL,
  session_id uuid NOT NULL,
  execution_fence integer NOT NULL CHECK (execution_fence > 0),
  attempt_key text NOT NULL,
  request_id uuid NOT NULL,
  institution_id uuid NOT NULL,
  student_id uuid NOT NULL,
  function_id uuid NOT NULL REFERENCES petros_ai_functions(id) ON DELETE RESTRICT,
  provider_id uuid NOT NULL REFERENCES petros_ai_providers(id) ON DELETE RESTRICT,
  model_id uuid NOT NULL REFERENCES petros_ai_models(id) ON DELETE RESTRICT,
  reserved_micros bigint NOT NULL CHECK (reserved_micros > 0),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'settled', 'ambiguous', 'released')),
  settled_micros bigint CHECK (settled_micros >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  CONSTRAINT petros_ai_attempt_reservations_settlement_check CHECK (
    (state = 'reserved' AND settled_micros IS NULL AND settled_at IS NULL)
    OR (state <> 'reserved' AND settled_micros IS NOT NULL AND settled_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX petros_ai_attempt_reservations_key_uniq ON petros_ai_attempt_reservations(attempt_key);
CREATE INDEX petros_ai_attempt_reservations_owner_idx ON petros_ai_attempt_reservations(institution_id, student_id, created_at);
CREATE INDEX petros_ai_attempt_reservations_provider_idx ON petros_ai_attempt_reservations(provider_id, created_at);
CREATE INDEX petros_ai_attempt_reservations_command_idx ON petros_ai_attempt_reservations(command_id);
CREATE UNIQUE INDEX petros_ai_usage_events_reservation_uniq ON petros_ai_usage_events(budget_reservation_id);
ALTER TABLE petros_ai_usage_events ADD CONSTRAINT petros_ai_usage_events_reservation_fk
  FOREIGN KEY (budget_reservation_id) REFERENCES petros_ai_attempt_reservations(id) ON DELETE RESTRICT;

ALTER TABLE petros_ai_attempt_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_ai_attempt_reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY petros_ai_attempt_reservations_owner ON petros_ai_attempt_reservations
  FOR ALL USING (
    institution_id::text = edrion_current_institution()
    AND student_id::text = edrion_current_student()
  ) WITH CHECK (
    institution_id::text = edrion_current_institution()
    AND student_id::text = edrion_current_student()
  );

-- This aggregate alone can cross learner RLS. It exposes only totals, after verifying
-- the calling transaction is scoped to the running command's owner and fence.
CREATE FUNCTION edrion_petros_ai_budget_snapshot(
  p_command_id uuid, p_fence integer, p_function_id uuid, p_provider_id uuid
) RETURNS TABLE (
  global_daily bigint, global_monthly bigint, provider_daily bigint,
  provider_monthly bigint, student_monthly bigint, function_daily_requests bigint,
  function_monthly_requests bigint, institution_monthly_requests bigint
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp SET row_security = off AS $$
DECLARE
  v_student text := edrion_current_student();
  v_institution text := edrion_current_institution();
  v_day timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_month timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  IF v_student IS NULL OR v_institution IS NULL OR NOT EXISTS (
    SELECT 1 FROM petros_session_commands c WHERE c.id = p_command_id
      AND c.institution_id::text = v_institution AND c.student_id::text = v_student
      AND c.execution_state = 'running' AND c.execution_fence = p_fence
      AND c.execution_version = 'petros.document-question-execution.v1'
      AND c.command = 'document_question.v1'
  ) THEN
    RAISE EXCEPTION 'PETROS_BUDGET_SCOPE_INVALID';
  END IF;
  RETURN QUERY
  WITH charges AS (
    SELECT u.created_at, u.function_id, u.provider_id, u.institution_id, u.student_id,
      u.request_id, coalesce(u.actual_cost_micros, u.estimated_cost_micros) AS amount
    FROM petros_ai_usage_events u WHERE u.created_at >= v_month
    UNION ALL
    SELECT greatest(r.created_at, v_day), r.function_id, r.provider_id, r.institution_id, r.student_id,
      r.request_id, r.reserved_micros
    FROM petros_ai_attempt_reservations r
    WHERE r.state = 'reserved'
  ),
  requests AS (
    SELECT u.created_at, u.function_id, u.institution_id, u.request_id
    FROM petros_ai_usage_events u WHERE u.created_at >= v_month
    UNION ALL
    SELECT r.created_at, r.function_id, r.institution_id, r.request_id
    FROM petros_ai_attempt_reservations r WHERE r.created_at >= v_month
  )
  SELECT
    coalesce((SELECT sum(c.amount) FROM charges c WHERE c.created_at >= v_day), 0)::bigint,
    coalesce((SELECT sum(c.amount) FROM charges c), 0)::bigint,
    coalesce((SELECT sum(c.amount) FROM charges c WHERE c.provider_id = p_provider_id AND c.created_at >= v_day), 0)::bigint,
    coalesce((SELECT sum(c.amount) FROM charges c WHERE c.provider_id = p_provider_id), 0)::bigint,
    coalesce((SELECT sum(c.amount) FROM charges c WHERE c.student_id::text = v_student AND c.institution_id::text = v_institution), 0)::bigint,
    (SELECT count(DISTINCT q.request_id) FROM requests q WHERE q.function_id = p_function_id AND q.created_at >= v_day)::bigint,
    (SELECT count(DISTINCT q.request_id) FROM requests q WHERE q.function_id = p_function_id)::bigint,
    (SELECT count(DISTINCT q.request_id) FROM requests q WHERE q.institution_id::text = v_institution)::bigint;
END $$;
REVOKE ALL ON FUNCTION edrion_petros_ai_budget_snapshot(uuid, integer, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION edrion_petros_ai_budget_snapshot(uuid, integer, uuid, uuid) TO edrion_app;
GRANT SELECT, INSERT, UPDATE ON petros_ai_attempt_reservations TO edrion_app;
