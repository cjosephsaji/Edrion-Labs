-- Close rollback admission and provider-dispatch accounting races.
--
-- Future durable versions must be able to coexist during a rolling upgrade. Older
-- binaries do not execute them (the dispatcher remains version-filtered), but they
-- must still observe queued/running rows and block the synchronous rollback path.
ALTER TABLE petros_session_commands
  DROP CONSTRAINT petros_question_execution_ck,
  ADD CONSTRAINT petros_question_execution_ck CHECK (execution_version IS NULL OR (
    (execution_version <> 'petros.document-question-execution.v1' OR command = 'document_question.v1')
    AND execution_state IS NOT NULL AND execution_state IN ('queued','running','succeeded','failed','cancelled')
    AND execution_input IS NOT NULL AND octet_length(execution_input::text) <= 20000
    AND requested_by IS NOT NULL AND input_sha256 IS NOT NULL AND source_fingerprint IS NOT NULL
    AND input_sha256 ~ '^[a-f0-9]{64}$' AND source_fingerprint ~ '^[a-f0-9]{64}$'
    AND execution_revision > 0 AND execution_attempts BETWEEN 0 AND 3 AND execution_fence >= 0
    AND (execution_state = 'running') = (execution_lease_until IS NOT NULL)
    AND (execution_state = 'succeeded') = (status = 'completed')
    AND status IN ('in_progress','completed')
    AND (execution_state = 'succeeded') = (response IS NOT NULL)
  ));

-- A legacy synchronous composer command and a durable document question may not be
-- active for the same learner at the same time. The index is the final arbiter for
-- concurrent transactions; application pre-checks remain useful typed fast paths.
DROP INDEX petros_question_active_student_uq;
CREATE UNIQUE INDEX petros_question_active_student_uq
  ON petros_session_commands(institution_id, student_id)
  WHERE (
    execution_version IS NOT NULL
    AND execution_state IN ('queued','running')
  ) OR (
    execution_version IS NULL
    AND command = 'composer_question'
    AND status = 'in_progress'
  );

-- A committed reservation is not proof that transport began. Recovery releases a
-- known-undispatched hold at zero and charges only attempts whose dispatch marker was
-- committed before leaving the database boundary for provider transport.
ALTER TABLE petros_ai_attempt_reservations
  ADD COLUMN provider_dispatched_at timestamptz;

-- Rows from earlier binaries cannot be distinguished safely. Preserve conservative
-- accounting for every historical non-released reservation.
UPDATE petros_ai_attempt_reservations
SET provider_dispatched_at = created_at
WHERE state <> 'released';
