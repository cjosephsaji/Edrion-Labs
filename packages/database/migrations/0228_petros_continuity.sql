-- Additive continuity references. Existing conversation, evidence and scene owners remain authoritative.
ALTER TABLE petros_student_companion_preferences ADD COLUMN optional_memory_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN memory_revision integer NOT NULL DEFAULT 0 CHECK(memory_revision BETWEEN 0 AND 999999),
 ADD COLUMN memory_cutoff_seq integer NOT NULL DEFAULT 0 CHECK(memory_cutoff_seq>=0);
CREATE TABLE petros_journeys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL, student_id uuid NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 999999), return_point jsonb NOT NULL,
 return_session_id uuid GENERATED ALWAYS AS ((return_point->>'sessionId')::uuid) STORED NOT NULL,
 dismissed_watermark text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,institution_id,student_id), FOREIGN KEY(return_session_id,institution_id,student_id) REFERENCES petros_learning_sessions(id,institution_id,student_id), FOREIGN KEY(student_id,institution_id) REFERENCES students(id,institution_id),
 CHECK(jsonb_typeof(return_point)='object' AND octet_length(return_point::text)<=16000)
);
CREATE TABLE petros_journey_sessions (
 session_id uuid PRIMARY KEY, journey_id uuid NOT NULL, institution_id uuid NOT NULL, student_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(journey_id,institution_id,student_id) REFERENCES petros_journeys(id,institution_id,student_id),
 FOREIGN KEY(session_id,institution_id,student_id) REFERENCES petros_learning_sessions(id,institution_id,student_id)
);
CREATE TABLE petros_memory_records (
 id uuid PRIMARY KEY, institution_id uuid NOT NULL, student_id uuid NOT NULL,
 category text NOT NULL CHECK(category IN ('episodic','hypothesis')), session_id uuid NOT NULL,
 source_version text NOT NULL, source_event_id uuid NOT NULL, supporting_evidence_ids jsonb NOT NULL,
 content text CHECK(length(content)<=1000), revision integer NOT NULL CHECK(revision BETWEEN 1 AND 999999),
 confidence double precision CHECK(confidence BETWEEN 0 AND 1), corrected boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(session_id,institution_id,student_id) REFERENCES petros_learning_sessions(id,institution_id,student_id),
 CHECK(jsonb_typeof(supporting_evidence_ids)='array' AND jsonb_array_length(supporting_evidence_ids)<=8),
 CHECK((deleted_at IS NULL AND content IS NOT NULL) OR (deleted_at IS NOT NULL AND content IS NULL)),
 CHECK(category<>'hypothesis' OR (confidence IS NOT NULL AND jsonb_array_length(supporting_evidence_ids)>0)),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 days'),
 CHECK(category<>'hypothesis' OR expires_at<=created_at+interval '7 days')
);
CREATE TABLE petros_continuity_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL, student_id uuid NOT NULL,
 command_id uuid NOT NULL, request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'), kind text NOT NULL,
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=16000), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(institution_id,student_id,command_id), FOREIGN KEY(student_id,institution_id) REFERENCES students(id,institution_id)
);
ALTER TABLE petros_memory_records ADD FOREIGN KEY(institution_id,student_id,source_event_id) REFERENCES petros_continuity_receipts(institution_id,student_id,command_id) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE FUNCTION petros_memory_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Forgotten memory cannot be resurrected'; END IF;
 IF NEW.id<>OLD.id OR NEW.institution_id<>OLD.institution_id OR NEW.student_id<>OLD.student_id OR
 NEW.category<>OLD.category OR NEW.session_id<>OLD.session_id OR NEW.source_version<>OLD.source_version OR
 NEW.source_event_id<>OLD.source_event_id OR NEW.created_at<>OLD.created_at OR NEW.expires_at<>OLD.expires_at OR
 NEW.supporting_evidence_ids<>OLD.supporting_evidence_ids OR NEW.confidence IS DISTINCT FROM OLD.confidence OR NEW.revision<>OLD.revision+1 THEN
 RAISE EXCEPTION 'Invalid memory revision'; END IF; RETURN NEW; END $$;
CREATE TRIGGER petros_memory_revision BEFORE UPDATE ON petros_memory_records FOR EACH ROW EXECUTE FUNCTION petros_memory_guard();
CREATE TRIGGER petros_continuity_receipt_immutable BEFORE UPDATE OR DELETE ON petros_continuity_receipts
 FOR EACH ROW EXECUTE FUNCTION petros_workspace_history_immutable();
CREATE TRIGGER petros_journey_session_immutable BEFORE UPDATE OR DELETE ON petros_journey_sessions
 FOR EACH ROW EXECUTE FUNCTION petros_workspace_history_immutable();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['petros_journeys','petros_journey_sessions','petros_memory_records','petros_continuity_receipts'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY petros_continuity_owner ON %I FOR ALL USING (institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student()) WITH CHECK (institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student())',t);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON petros_journeys,petros_memory_records TO edrion_app;
GRANT SELECT,INSERT ON petros_journey_sessions,petros_continuity_receipts TO edrion_app;
REVOKE DELETE,TRUNCATE ON petros_journeys,petros_memory_records FROM edrion_app;
REVOKE UPDATE,DELETE,TRUNCATE ON petros_journey_sessions,petros_continuity_receipts FROM edrion_app;

CREATE UNIQUE INDEX petros_note_device_sequence ON petros_continuity_receipts(institution_id,student_id,(result->>'deviceId'),(result->>'sequence')) WHERE kind='note';
