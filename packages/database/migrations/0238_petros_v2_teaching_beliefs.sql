-- M5 extends the existing durable task/session and evidence owners. No V1 rows are changed.
ALTER TABLE petros_v2_tasks DROP CONSTRAINT petros_v2_tasks_session_id_key;
--> statement-breakpoint
CREATE INDEX petros_v2_tasks_session_idx ON petros_v2_tasks(session_id,issued_at);
--> statement-breakpoint
CREATE TABLE petros_concept_beliefs (
 institution_id uuid NOT NULL, student_id uuid NOT NULL, objective_id uuid NOT NULL, concept_id uuid NOT NULL,
 concept_version integer NOT NULL CHECK(concept_version>0), graph_version text NOT NULL,
 algorithm_version text NOT NULL CHECK(algorithm_version='petros.categorical.v1'), publication_hash text NOT NULL CHECK(publication_hash ~ '^[a-f0-9]{64}$'),
 projection jsonb NOT NULL CHECK(projection->>'state' IN ('not_assessed','developing','demonstrated_in_session','retention_supported','review_due')),
 projection_hash text NOT NULL CHECK(projection_hash ~ '^[a-f0-9]{64}$'), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(institution_id,student_id,objective_id,concept_id,concept_version,graph_version,algorithm_version),
 FOREIGN KEY(student_id,institution_id) REFERENCES students(id,institution_id));
--> statement-breakpoint
ALTER TABLE petros_concept_beliefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE petros_concept_beliefs FORCE ROW LEVEL SECURITY;
