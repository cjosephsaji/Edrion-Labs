-- Petros failure fixes: keep the persistent learning-loop constraint aligned
-- with the first-class Teach-it-back session contract.
ALTER TABLE petros_learning_sessions
  DROP CONSTRAINT IF EXISTS petros_learning_sessions_type_ck;

ALTER TABLE petros_learning_sessions
  ADD CONSTRAINT petros_learning_sessions_type_ck
  CHECK (session_type IN ('learn', 'revise', 'repair', 'doubt', 'teach_it_back'));
