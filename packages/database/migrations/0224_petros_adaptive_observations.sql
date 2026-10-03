-- An adaptive response ends this item without asserting successful recovery.
ALTER TABLE petros_struggle_stretches DROP CONSTRAINT petros_struggle_stretches_status_ck;
ALTER TABLE petros_struggle_stretches ADD CONSTRAINT petros_struggle_stretches_status_ck
 CHECK(status IN ('active','reworded','recovered','stuck_support','observed'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION edrion_guard_petros_evidence_outbox_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PETROS_EVIDENCE_OUTBOX_IMMUTABLE'; END IF;
 IF (NEW.id,NEW.institution_id,NEW.student_id,NEW.event_id,NEW.topic,NEW.payload,NEW.created_at)
 IS DISTINCT FROM (OLD.id,OLD.institution_id,OLD.student_id,OLD.event_id,OLD.topic,OLD.payload,OLD.created_at)
 THEN RAISE EXCEPTION 'PETROS_EVIDENCE_OUTBOX_IMMUTABLE'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER petros_objective_evidence_outbox_identity BEFORE UPDATE OR DELETE ON petros_objective_evidence_outbox
 FOR EACH ROW EXECUTE FUNCTION edrion_guard_petros_evidence_outbox_identity();
--> statement-breakpoint
-- Keep one initial event per response; allow append-only disclosure corrections.
DROP INDEX petros_objective_evidence_events_owner_evaluation_uniq;
CREATE UNIQUE INDEX petros_objective_evidence_events_owner_evaluation_uniq
 ON petros_objective_evidence_events(institution_id,student_id,evaluation_id) WHERE corrects_event_id IS NULL;
