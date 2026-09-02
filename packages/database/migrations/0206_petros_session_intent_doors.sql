-- Keep the persisted intent-door constraint aligned with the first-class
-- reflection and homework entry points supported by the API contract.
ALTER TABLE petros_session_intents
  DROP CONSTRAINT IF EXISTS petros_session_intents_door_ck;

ALTER TABLE petros_session_intents
  ADD CONSTRAINT petros_session_intents_door_ck
  CHECK (
    door IN (
      'result_repair',
      'upcoming_exam',
      'uploaded_document',
      'learning_path',
      'assistant_handoff',
      'reflection_action',
      'active_homework'
    )
  );
