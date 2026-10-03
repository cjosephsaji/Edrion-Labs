DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Question execution dispatcher requires a BYPASSRLS migration role';
  END IF;
END $$;

ALTER TABLE petros_session_commands
  ADD COLUMN execution_version text,
  ADD COLUMN execution_state text,
  ADD COLUMN execution_input jsonb,
  ADD COLUMN input_sha256 text,
  ADD COLUMN requested_by uuid,
  ADD COLUMN source_fingerprint text,
  ADD COLUMN execution_revision integer NOT NULL DEFAULT 1,
  ADD COLUMN execution_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN execution_fence integer NOT NULL DEFAULT 0,
  ADD COLUMN execution_lease_until timestamptz,
  ADD COLUMN next_dispatch_at timestamptz,
  ADD COLUMN dispatch_sequence integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT petros_question_execution_ck CHECK (execution_version IS NULL OR (
    execution_version = 'petros.document-question-execution.v1' AND command = 'document_question.v1'
    AND execution_state IS NOT NULL AND execution_state IN ('queued','running','succeeded','failed','cancelled')
    AND execution_input IS NOT NULL AND octet_length(execution_input::text) <= 20000
    AND requested_by IS NOT NULL AND input_sha256 IS NOT NULL AND source_fingerprint IS NOT NULL AND input_sha256 ~ '^[a-f0-9]{64}$' AND source_fingerprint ~ '^[a-f0-9]{64}$'
    AND execution_revision > 0 AND execution_attempts BETWEEN 0 AND 3 AND execution_fence >= 0
    AND (execution_state = 'running') = (execution_lease_until IS NOT NULL)
    AND (execution_state = 'succeeded') = (status = 'completed')
    AND status IN ('in_progress','completed')
    AND (execution_state = 'succeeded') = (response IS NOT NULL)
  ));
CREATE UNIQUE INDEX petros_question_active_student_uq ON petros_session_commands(institution_id, student_id)
  WHERE execution_version IS NOT NULL AND execution_state IN ('queued','running');
CREATE INDEX petros_question_due_idx ON petros_session_commands(next_dispatch_at)
  WHERE execution_version IS NOT NULL AND execution_state IN ('queued','running');

CREATE FUNCTION edrion_question_execution_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.execution_version IS NOT NULL THEN
    IF ROW(NEW.execution_version, NEW.execution_input, NEW.input_sha256, NEW.requested_by,
      NEW.source_fingerprint, NEW.session_id, NEW.student_id, NEW.institution_id, NEW.idempotency_key, NEW.command, NEW.created_at)
      IS DISTINCT FROM ROW(OLD.execution_version, OLD.execution_input, OLD.input_sha256, OLD.requested_by,
      OLD.source_fingerprint, OLD.session_id, OLD.student_id, OLD.institution_id, OLD.idempotency_key, OLD.command, OLD.created_at)
      OR NEW.execution_fence < OLD.execution_fence OR NEW.execution_attempts < OLD.execution_attempts THEN
      RAISE EXCEPTION 'Question execution identity and attempt history are immutable';
    END IF;
  END IF;
  IF NEW.execution_version IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM petros_learning_sessions s WHERE s.id = NEW.session_id
      AND s.institution_id = NEW.institution_id AND s.student_id = NEW.student_id
  ) THEN RAISE EXCEPTION 'Question execution owner mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER petros_question_execution_identity BEFORE INSERT OR UPDATE ON petros_session_commands
  FOR EACH ROW EXECUTE FUNCTION edrion_question_execution_identity();

-- IDs only across tenants; all business reads and writes retain the existing RLS policies.
CREATE FUNCTION edrion_due_petros_questions() RETURNS TABLE(id uuid, institution_id uuid, student_id uuid, dispatch_sequence integer)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public SET row_security = off AS $$
  WITH due AS (
    SELECT p.id FROM public.petros_session_commands p
    WHERE p.execution_version = 'petros.document-question-execution.v1'
      AND p.execution_state IN ('queued','running') AND p.next_dispatch_at <= now()
      AND (p.execution_lease_until IS NULL OR p.execution_lease_until <= now())
    ORDER BY p.next_dispatch_at, p.id LIMIT 20 FOR UPDATE SKIP LOCKED
  ) UPDATE public.petros_session_commands p
    SET next_dispatch_at = now() + interval '10 seconds', dispatch_sequence = p.dispatch_sequence + 1
    FROM due WHERE p.id = due.id RETURNING p.id, p.institution_id, p.student_id, p.dispatch_sequence;
$$;
REVOKE ALL ON FUNCTION edrion_due_petros_questions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION edrion_due_petros_questions() TO edrion_app;
