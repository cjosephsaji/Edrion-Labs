ALTER TABLE petros_session_commands
  ADD COLUMN knowledge_policy jsonb,
  ADD COLUMN admission_denial jsonb,
  ADD CONSTRAINT petros_question_knowledge_policy_ck CHECK (knowledge_policy IS NULL OR ((
    execution_version IS NOT NULL AND jsonb_typeof(knowledge_policy) = 'object'
    AND knowledge_policy->>'schemaVersion' = 'petros.knowledge-policy.v1'
    AND knowledge_policy->>'mode' IN ('source_bound','source_primary','general_learning')
    AND knowledge_policy->>'sourceFingerprint' = source_fingerprint
    AND octet_length(knowledge_policy::text) <= 32000
  ) IS TRUE)),
  ADD CONSTRAINT petros_question_admission_denial_ck CHECK (admission_denial IS NULL OR ((
    execution_version IS NOT NULL AND jsonb_typeof(admission_denial) = 'object'
    AND admission_denial->>'category' IN ('safety_resource_limit','product_plan_allowance','abuse_control','pedagogical_attempt_policy')
    AND octet_length(admission_denial::text) <= 2000
  ) IS TRUE));

CREATE FUNCTION edrion_question_knowledge_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.knowledge_policy IS DISTINCT FROM OLD.knowledge_policy THEN
    RAISE EXCEPTION 'Question knowledge policy is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER petros_question_knowledge_identity BEFORE UPDATE ON petros_session_commands
  FOR EACH ROW EXECUTE FUNCTION edrion_question_knowledge_identity();
