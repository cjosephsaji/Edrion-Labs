-- Optional exact learning provenance around existing explicitly saved artifacts/reviews.
ALTER TABLE petros_artifact_commit_commands ADD COLUMN request_hash text CHECK(request_hash IS NULL OR request_hash ~ '^[a-f0-9]{64}$');
CREATE TABLE petros_learning_artifact_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES institutions(id),
 student_id uuid NOT NULL REFERENCES students(id),
 artifact_id uuid NOT NULL REFERENCES petros_saved_artifacts(id),
 revision integer NOT NULL CHECK(revision BETWEEN 1 AND 100000),
 command_id uuid NOT NULL,
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 receipt jsonb NOT NULL CHECK((jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=96000) IS TRUE),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX petros_learning_artifact_receipts_revision ON petros_learning_artifact_receipts(artifact_id,revision);
CREATE TABLE petros_learning_review_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES institutions(id),
 student_id uuid NOT NULL REFERENCES students(id),
 artifact_receipt_id uuid NOT NULL REFERENCES petros_learning_artifact_receipts(id),
 review_outcome_id uuid NOT NULL REFERENCES petros_artifact_review_outcomes(id),
 client_review_id uuid NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 receipt jsonb NOT NULL CHECK((jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=96000) IS TRUE),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX petros_learning_review_receipts_outcome ON petros_learning_review_receipts(review_outcome_id);
CREATE UNIQUE INDEX petros_learning_review_receipts_command ON petros_learning_review_receipts(institution_id,student_id,client_review_id);
--> statement-breakpoint
ALTER TABLE petros_learning_artifact_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_learning_artifact_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY petros_learning_artifact_receipts_owner ON petros_learning_artifact_receipts FOR ALL
 USING(institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student())
 WITH CHECK(institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student());
ALTER TABLE petros_learning_review_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_learning_review_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY petros_learning_review_receipts_owner ON petros_learning_review_receipts FOR ALL
 USING(institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student())
 WITH CHECK(institution_id::text=edrion_current_institution() AND student_id::text=edrion_current_student());
CREATE TRIGGER petros_learning_artifact_receipts_immutable BEFORE UPDATE OR DELETE ON petros_learning_artifact_receipts
 FOR EACH ROW EXECUTE FUNCTION edrion_guard_petros_objective_evidence_immutable();
CREATE TRIGGER petros_learning_review_receipts_immutable BEFORE UPDATE OR DELETE ON petros_learning_review_receipts
 FOR EACH ROW EXECUTE FUNCTION edrion_guard_petros_objective_evidence_immutable();
GRANT SELECT,INSERT ON petros_learning_artifact_receipts,petros_learning_review_receipts TO edrion_app;
REVOKE UPDATE,DELETE,TRUNCATE ON petros_learning_artifact_receipts,petros_learning_review_receipts FROM edrion_app;
