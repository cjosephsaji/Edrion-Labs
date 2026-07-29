-- 0108_learn_teardown
-- Petros Learn rebuild: drop Learn-private engine storage for a clean v2 schema (0109).
-- learn_topics, concept_atoms, revision_states, learning_paths, learning_path_items,
-- quick_answers, learn_ai_calls, and learning_events are intentionally untouched.
-- Student-made rows (flashcards, notes, canvases) survive — FKs are ON DELETE SET NULL;
-- DROP TABLE … CASCADE drops the constraint, not the referencing rows.

-- Artifact counts (report only; destructive delete of student content is forbidden).
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

-- learn_ai_calls is append-only via TWO triggers (migration 0051 + zzz_grants).
-- Both must be dropped before nulling session/block FKs, or the UPDATE aborts
-- on any non-empty table.
DROP TRIGGER IF EXISTS learn_ai_calls_no_update ON learn_ai_calls;
DROP TRIGGER IF EXISTS learn_ai_calls_append_only ON learn_ai_calls;

UPDATE learn_ai_calls SET session_id = NULL, block_id = NULL
  WHERE session_id IS NOT NULL OR block_id IS NOT NULL;

CREATE OR REPLACE FUNCTION learn_ai_calls_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'learn_ai_calls is append-only'; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER learn_ai_calls_no_update
  BEFORE UPDATE OR DELETE ON learn_ai_calls
  FOR EACH ROW EXECUTE FUNCTION learn_ai_calls_immutable();

-- Engine tables only. Curriculum / ledger / student-made content stay.
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
