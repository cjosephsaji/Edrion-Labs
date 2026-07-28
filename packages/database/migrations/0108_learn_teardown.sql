-- 0108_learn_teardown
-- Petros Learn rebuild: drop Learn-private storage for a clean engine schema (0109).
-- learn_topics, concept_atoms, revision_states, learning_paths, quick_answers,
-- learn_ai_calls, and learning_events are intentionally untouched.

-- D5 artifact counts (report only; destructive delete requires explicit confirmation).
DO $$
DECLARE
  deck_count bigint;
  card_count bigint;
  note_count bigint;
  canvas_count bigint;
BEGIN
  SELECT COUNT(*) INTO deck_count FROM flashcard_decks WHERE source_session_id IS NOT NULL;
  SELECT COUNT(*) INTO card_count FROM flashcards f
    JOIN flashcard_decks d ON d.id = f.deck_id WHERE d.source_session_id IS NOT NULL;
  SELECT COUNT(*) INTO note_count FROM knowledge_artifacts WHERE source_session_id IS NOT NULL;
  SELECT COUNT(*) INTO canvas_count FROM visual_canvases WHERE source_session_id IS NOT NULL;
  RAISE NOTICE 'learn teardown artifact counts: decks=%, cards=%, notes=%, canvases=%',
    deck_count, card_count, note_count, canvas_count;
END $$;

-- learn_ai_calls is append-only; clear dangling session/block FKs before drops.
DROP TRIGGER IF EXISTS learn_ai_calls_no_update ON learn_ai_calls;
UPDATE learn_ai_calls SET session_id = NULL, block_id = NULL
  WHERE session_id IS NOT NULL OR block_id IS NOT NULL;

CREATE OR REPLACE FUNCTION learn_ai_calls_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'learn_ai_calls is append-only'; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS learn_ai_calls_no_update ON learn_ai_calls;
CREATE TRIGGER learn_ai_calls_no_update
  BEFORE UPDATE OR DELETE ON learn_ai_calls
  FOR EACH ROW EXECUTE FUNCTION learn_ai_calls_immutable();

DROP TABLE IF EXISTS learn_session_events CASCADE;
DROP TABLE IF EXISTS learner_model_events CASCADE;
DROP TABLE IF EXISTS learn_attempts CASCADE;
DROP TABLE IF EXISTS learn_session_blocks CASCADE;
DROP TABLE IF EXISTS learn_sessions CASCADE;
DROP TABLE IF EXISTS learn_topic_profiles CASCADE;
DROP TABLE IF EXISTS learner_mastery CASCADE;
DROP TABLE IF EXISTS learner_model_state CASCADE;
DROP TABLE IF EXISTS evidence_tags CASCADE;
DROP TABLE IF EXISTS learn_config CASCADE;

DELETE FROM features WHERE key = 'learn.orchestrator';
