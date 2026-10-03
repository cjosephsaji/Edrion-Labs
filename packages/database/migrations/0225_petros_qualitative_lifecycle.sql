CREATE TABLE petros_qualitative_events (
 id uuid PRIMARY KEY, institution_id uuid NOT NULL REFERENCES institutions(id),student_id uuid NOT NULL REFERENCES students(id),
 course_id uuid NOT NULL REFERENCES courses(id),artifact_id uuid NOT NULL REFERENCES petros_saved_artifacts(id),
 revision integer NOT NULL CHECK(revision>0),kind text NOT NULL CHECK(kind IN ('feedback_request','draft_feedback','review_revoked')),
 command_id uuid NOT NULL,request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),target_id uuid NOT NULL,
 payload jsonb NOT NULL CHECK((jsonb_typeof(payload)='object' AND octet_length(payload::text)<=131072) IS TRUE),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX petros_qualitative_events_command_uq ON petros_qualitative_events(institution_id,student_id,command_id);
CREATE UNIQUE INDEX petros_qualitative_events_target_uq ON petros_qualitative_events(institution_id,student_id,kind,target_id);
ALTER TABLE petros_qualitative_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_qualitative_events FORCE ROW LEVEL SECURITY;
CREATE POLICY petros_qualitative_events_read ON petros_qualitative_events FOR SELECT
 USING(institution_id::text=edrion_current_institution() AND (student_id::text=edrion_current_student() OR edrion_current_student() IS NULL));
CREATE POLICY petros_qualitative_events_write ON petros_qualitative_events FOR INSERT
 WITH CHECK(institution_id::text=edrion_current_institution() AND
  ((kind='feedback_request' AND student_id::text=edrion_current_student()) OR (kind!='feedback_request' AND edrion_current_student() IS NULL)));
CREATE TRIGGER petros_qualitative_events_immutable BEFORE UPDATE OR DELETE ON petros_qualitative_events
 FOR EACH ROW EXECUTE FUNCTION edrion_guard_petros_objective_evidence_immutable();
-- Sharing a draft exposes only that exact current revision to the teacher-side owner.
CREATE POLICY petros_artifact_draft_request_read ON petros_saved_artifacts FOR SELECT
 USING(institution_id::text=edrion_current_institution() AND edrion_current_student() IS NULL AND
 EXISTS(SELECT 1 FROM petros_qualitative_events e WHERE e.kind='feedback_request' AND e.artifact_id=petros_saved_artifacts.id
 AND e.institution_id=petros_saved_artifacts.institution_id AND e.student_id=petros_saved_artifacts.student_id AND e.revision=petros_saved_artifacts.revision));
CREATE POLICY petros_artifact_draft_request_lock ON petros_saved_artifacts FOR UPDATE
 USING(institution_id::text=edrion_current_institution() AND edrion_current_student() IS NULL AND
 EXISTS(SELECT 1 FROM petros_qualitative_events e WHERE e.kind='feedback_request' AND e.artifact_id=petros_saved_artifacts.id
 AND e.institution_id=petros_saved_artifacts.institution_id AND e.student_id=petros_saved_artifacts.student_id AND e.revision=petros_saved_artifacts.revision)) WITH CHECK(false);
GRANT SELECT,INSERT ON petros_qualitative_events TO edrion_app;
REVOKE UPDATE,DELETE,TRUNCATE ON petros_qualitative_events FROM edrion_app;
--> statement-breakpoint
-- Optional, explicit student disclosure of bounded learning provenance for this submission.
-- The original planning table had no RLS. Preserve legacy staff reads, while new
-- adaptive records are student-owned unless explicitly shared below.
ALTER TABLE petros_planning_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_planning_decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY petros_planning_owner ON petros_planning_decisions FOR ALL
 USING(institution_id::text=edrion_current_institution() AND
  (student_id::text=edrion_current_student() OR (edrion_current_student() IS NULL AND adaptive_snapshot IS NULL)))
 WITH CHECK(institution_id::text=edrion_current_institution() AND
  (student_id::text=edrion_current_student() OR (edrion_current_student() IS NULL AND adaptive_snapshot IS NULL)));
-- A permissive tenant-wide policy would otherwise override the explicit-sharing
-- policy. Ledger command receipts/projections/outbox remain private to the owner.
ALTER POLICY petros_objective_evidence_events_owner ON petros_objective_evidence_events
 USING(institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student())
 WITH CHECK(institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student());
ALTER POLICY petros_objective_evidence_commands_owner ON petros_objective_evidence_commands
 USING(institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student())
 WITH CHECK(institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student());
ALTER POLICY petros_objective_evidence_outbox_owner ON petros_objective_evidence_outbox
 USING(institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student())
 WITH CHECK(institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student());
ALTER POLICY petros_objective_evidence_projections_owner ON petros_objective_evidence_projections
 USING(institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student())
 WITH CHECK(institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student());
CREATE POLICY petros_decision_explicit_provenance_read ON petros_planning_decisions FOR SELECT
 USING(institution_id::text=edrion_current_institution() AND edrion_current_student() IS NULL AND
 EXISTS(SELECT 1 FROM petros_qualitative_submissions s WHERE s.institution_id=petros_planning_decisions.institution_id
 AND s.student_id=petros_planning_decisions.student_id AND s.session_id=petros_planning_decisions.session_id
 AND petros_planning_decisions.created_at <= s.created_at
 AND s.submission->>'shareLearningProvenance'='true'));
CREATE POLICY petros_evidence_explicit_provenance_read ON petros_objective_evidence_events FOR SELECT
 USING(institution_id::text=edrion_current_institution() AND edrion_current_student() IS NULL AND
 EXISTS(SELECT 1 FROM petros_qualitative_submissions s WHERE s.institution_id=petros_objective_evidence_events.institution_id
 AND s.student_id=petros_objective_evidence_events.student_id AND s.session_id=petros_objective_evidence_events.session_id
 AND s.pack_id=petros_objective_evidence_events.pack_id AND s.pack_version=petros_objective_evidence_events.pack_version
 AND petros_objective_evidence_events.created_at <= s.created_at
 AND s.submission->>'shareLearningProvenance'='true'));
