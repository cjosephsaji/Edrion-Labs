-- Close cross-owner reference gaps in the additive Phase 2 tables.  RLS checks
-- the declared owner; these composite keys also prove that every referenced
-- row belongs to that same institution/student.

ALTER TABLE students ADD CONSTRAINT students_id_institution_uq UNIQUE (id, institution_id);
ALTER TABLE institution_users ADD CONSTRAINT institution_users_id_institution_uq UNIQUE (id, institution_id);
ALTER TABLE staff ADD CONSTRAINT staff_id_institution_user_uq UNIQUE (id, institution_id, institution_user_id);
ALTER TABLE knowledge_items ADD CONSTRAINT knowledge_items_id_institution_uq UNIQUE (id, institution_id);
ALTER TABLE assignments ADD CONSTRAINT assignments_id_institution_uq UNIQUE (id, institution_id);
ALTER TABLE petros_answer_evaluations ADD CONSTRAINT petros_answer_evaluation_owner_uq
  UNIQUE (id, institution_id, student_id, session_id);
ALTER TABLE petros_saved_artifacts ADD CONSTRAINT petros_saved_artifact_owner_uq
  UNIQUE (id, institution_id, student_id);
ALTER TABLE petros_artifact_revisions ADD CONSTRAINT petros_artifact_revision_owner_uq
  UNIQUE (id, institution_id, student_id, artifact_id, revision);
ALTER TABLE petros_artifact_review_outcomes ADD CONSTRAINT petros_artifact_review_owner_uq
  UNIQUE (id, institution_id, student_id);
ALTER TABLE petros_objective_evidence_events ADD CONSTRAINT petros_evidence_event_owner_uq
  UNIQUE (id, institution_id, student_id);
ALTER TABLE petros_qualitative_submissions ADD CONSTRAINT petros_qualitative_submission_owner_uq
  UNIQUE (id, institution_id, student_id, course_id);
ALTER TABLE petros_learning_artifact_receipts ADD CONSTRAINT petros_artifact_receipt_owner_uq
  UNIQUE (id, institution_id, student_id);
ALTER TABLE petros_assignment_learning_releases ADD CONSTRAINT petros_assignment_release_tenant_uq
  UNIQUE (id, institution_id);

--> statement-breakpoint
ALTER TABLE petros_teaching_pack_candidates
  ADD CONSTRAINT petros_pack_candidate_source_owner_fk
    FOREIGN KEY (source_item_id, institution_id)
    REFERENCES knowledge_items(id, institution_id) ON DELETE RESTRICT,
  ADD CONSTRAINT petros_pack_candidate_creator_tenant_fk
    FOREIGN KEY (created_by_user_id, institution_id)
    REFERENCES institution_users(id, institution_id) ON DELETE RESTRICT,
  ADD CONSTRAINT petros_pack_candidate_review_identity_uq
    UNIQUE (id, institution_id, course_id, source_item_id);

ALTER TABLE petros_reviewer_qualifications
  ADD CONSTRAINT petros_qualification_reviewer_tenant_fk
    FOREIGN KEY (reviewer_user_id, institution_id)
    REFERENCES institution_users(id, institution_id) ON DELETE RESTRICT,
  ADD CONSTRAINT petros_qualification_reviewer_staff_fk
    FOREIGN KEY (reviewer_staff_id, institution_id, reviewer_user_id)
    REFERENCES staff(id, institution_id, institution_user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT petros_qualification_recorder_tenant_fk
    FOREIGN KEY (recorded_by_user_id, institution_id)
    REFERENCES institution_users(id, institution_id) ON DELETE RESTRICT,
  ADD CONSTRAINT petros_qualification_review_identity_uq
    UNIQUE (qualification_id, qualification_version, institution_id, reviewer_user_id);

ALTER TABLE petros_teaching_pack_reviews
  ADD CONSTRAINT petros_pack_review_candidate_owner_fk
    FOREIGN KEY (candidate_id, institution_id, course_id, source_item_id)
    REFERENCES petros_teaching_pack_candidates(id, institution_id, course_id, source_item_id) ON DELETE RESTRICT,
  ADD CONSTRAINT petros_pack_review_qualification_owner_fk
    FOREIGN KEY (qualification_id, qualification_version, institution_id, reviewer_user_id)
    REFERENCES petros_reviewer_qualifications(qualification_id, qualification_version, institution_id, reviewer_user_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT petros_pack_review_owner_identity_uq
    UNIQUE (id, institution_id, course_id, source_item_id);

ALTER TABLE petros_teaching_pack_review_revocations
  ADD CONSTRAINT petros_pack_revocation_review_owner_fk
    FOREIGN KEY (review_id, institution_id, course_id, source_item_id)
    REFERENCES petros_teaching_pack_reviews(id, institution_id, course_id, source_item_id) ON DELETE RESTRICT,
  ADD CONSTRAINT petros_pack_revocation_actor_tenant_fk
    FOREIGN KEY (revoked_by_user_id, institution_id)
    REFERENCES institution_users(id, institution_id) ON DELETE RESTRICT;

--> statement-breakpoint
ALTER TABLE petros_objective_evidence_commands
  ADD CONSTRAINT petros_evidence_command_student_tenant_fk
    FOREIGN KEY (student_id, institution_id) REFERENCES students(id, institution_id) ON DELETE CASCADE,
  ADD CONSTRAINT petros_evidence_command_session_owner_fk
    FOREIGN KEY (session_id, institution_id, student_id)
    REFERENCES petros_learning_sessions(id, institution_id, student_id) ON DELETE CASCADE,
  ADD CONSTRAINT petros_evidence_command_evaluation_owner_fk
    FOREIGN KEY (evaluation_id, institution_id, student_id, session_id)
    REFERENCES petros_answer_evaluations(id, institution_id, student_id, session_id) ON DELETE RESTRICT,
  ADD CONSTRAINT petros_evidence_command_event_owner_fk
    FOREIGN KEY (event_id, institution_id, student_id)
    REFERENCES petros_objective_evidence_events(id, institution_id, student_id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE petros_objective_evidence_events
  ADD CONSTRAINT petros_evidence_event_student_tenant_fk
    FOREIGN KEY (student_id, institution_id) REFERENCES students(id, institution_id) ON DELETE CASCADE,
  ADD CONSTRAINT petros_evidence_event_session_owner_fk
    FOREIGN KEY (session_id, institution_id, student_id)
    REFERENCES petros_learning_sessions(id, institution_id, student_id) ON DELETE CASCADE,
  ADD CONSTRAINT petros_evidence_event_evaluation_owner_fk
    FOREIGN KEY (evaluation_id, institution_id, student_id, session_id)
    REFERENCES petros_answer_evaluations(id, institution_id, student_id, session_id) ON DELETE RESTRICT,
  ADD CONSTRAINT petros_evidence_correction_owner_fk
    FOREIGN KEY (corrects_event_id, institution_id, student_id)
    REFERENCES petros_objective_evidence_events(id, institution_id, student_id) ON DELETE RESTRICT;

ALTER TABLE petros_objective_evidence_outbox
  ADD CONSTRAINT petros_evidence_outbox_student_tenant_fk
    FOREIGN KEY (student_id, institution_id) REFERENCES students(id, institution_id) ON DELETE CASCADE,
  ADD CONSTRAINT petros_evidence_outbox_event_owner_fk
    FOREIGN KEY (event_id, institution_id, student_id)
    REFERENCES petros_objective_evidence_events(id, institution_id, student_id) ON DELETE RESTRICT;

ALTER TABLE petros_objective_evidence_projections
  ADD CONSTRAINT petros_evidence_projection_student_tenant_fk
    FOREIGN KEY (student_id, institution_id) REFERENCES students(id, institution_id) ON DELETE CASCADE;

ALTER TABLE petros_qualitative_submissions
  ADD CONSTRAINT petros_submission_student_tenant_fk
    FOREIGN KEY (student_id, institution_id) REFERENCES students(id, institution_id) ON DELETE CASCADE,
  ADD CONSTRAINT petros_submission_session_owner_fk
    FOREIGN KEY (session_id, institution_id, student_id)
    REFERENCES petros_learning_sessions(id, institution_id, student_id) ON DELETE CASCADE,
  ADD CONSTRAINT petros_submission_artifact_owner_fk
    FOREIGN KEY (artifact_id, institution_id, student_id)
    REFERENCES petros_saved_artifacts(id, institution_id, student_id) ON DELETE RESTRICT,
  ADD CONSTRAINT petros_submission_revision_owner_fk
    FOREIGN KEY (revision_id, institution_id, student_id, artifact_id, revision)
    REFERENCES petros_artifact_revisions(id, institution_id, student_id, artifact_id, revision) ON DELETE RESTRICT;

ALTER TABLE petros_qualitative_reviews
  ADD CONSTRAINT petros_qualitative_review_student_tenant_fk
    FOREIGN KEY (student_id, institution_id) REFERENCES students(id, institution_id) ON DELETE CASCADE,
  ADD CONSTRAINT petros_qualitative_review_submission_owner_fk
    FOREIGN KEY (submission_id, institution_id, student_id, course_id)
    REFERENCES petros_qualitative_submissions(id, institution_id, student_id, course_id) ON DELETE RESTRICT,
  ADD CONSTRAINT petros_qualitative_review_reviewer_tenant_fk
    FOREIGN KEY (reviewer_institution_user_id, institution_id)
    REFERENCES institution_users(id, institution_id) ON DELETE RESTRICT;

--> statement-breakpoint
ALTER TABLE petros_visual_operations
  ADD CONSTRAINT petros_visual_operation_student_tenant_fk
    FOREIGN KEY (student_id, institution_id) REFERENCES students(id, institution_id) ON DELETE RESTRICT;
ALTER TABLE petros_adaptive_bindings
  ADD CONSTRAINT petros_adaptive_binding_student_tenant_fk
    FOREIGN KEY (student_id, institution_id) REFERENCES students(id, institution_id) ON DELETE RESTRICT;

ALTER TABLE petros_learning_artifact_receipts
  ADD CONSTRAINT petros_learning_receipt_student_tenant_fk
    FOREIGN KEY (student_id, institution_id) REFERENCES students(id, institution_id) ON DELETE RESTRICT,
  ADD CONSTRAINT petros_learning_receipt_artifact_owner_fk
    FOREIGN KEY (artifact_id, institution_id, student_id)
    REFERENCES petros_saved_artifacts(id, institution_id, student_id) ON DELETE RESTRICT;

ALTER TABLE petros_learning_review_receipts
  ADD CONSTRAINT petros_review_receipt_student_tenant_fk
    FOREIGN KEY (student_id, institution_id) REFERENCES students(id, institution_id) ON DELETE RESTRICT,
  ADD CONSTRAINT petros_review_receipt_artifact_owner_fk
    FOREIGN KEY (artifact_receipt_id, institution_id, student_id)
    REFERENCES petros_learning_artifact_receipts(id, institution_id, student_id) ON DELETE RESTRICT,
  ADD CONSTRAINT petros_review_receipt_outcome_owner_fk
    FOREIGN KEY (review_outcome_id, institution_id, student_id)
    REFERENCES petros_artifact_review_outcomes(id, institution_id, student_id) ON DELETE RESTRICT;

ALTER TABLE petros_qualitative_events
  ADD CONSTRAINT petros_qualitative_event_student_tenant_fk
    FOREIGN KEY (student_id, institution_id) REFERENCES students(id, institution_id) ON DELETE RESTRICT,
  ADD CONSTRAINT petros_qualitative_event_course_tenant_fk
    FOREIGN KEY (course_id, institution_id) REFERENCES courses(id, institution_id) ON DELETE RESTRICT,
  ADD CONSTRAINT petros_qualitative_event_artifact_owner_fk
    FOREIGN KEY (artifact_id, institution_id, student_id)
    REFERENCES petros_saved_artifacts(id, institution_id, student_id) ON DELETE RESTRICT;

--> statement-breakpoint
ALTER TABLE petros_assignment_learning_releases
  ADD CONSTRAINT petros_assignment_release_assignment_tenant_fk
    FOREIGN KEY (assignment_id, institution_id) REFERENCES assignments(id, institution_id) ON DELETE RESTRICT,
  ADD CONSTRAINT petros_assignment_release_creator_tenant_fk
    FOREIGN KEY (created_by_user_id, institution_id)
    REFERENCES institution_users(id, institution_id) ON DELETE RESTRICT;

ALTER TABLE petros_assignment_learning_targets
  ADD CONSTRAINT petros_assignment_target_release_tenant_fk
    FOREIGN KEY (release_id, institution_id)
    REFERENCES petros_assignment_learning_releases(id, institution_id) ON DELETE RESTRICT;

ALTER TABLE petros_assignment_learning_recipients
  ADD CONSTRAINT petros_assignment_recipient_release_tenant_fk
    FOREIGN KEY (release_id, institution_id)
    REFERENCES petros_assignment_learning_releases(id, institution_id) ON DELETE RESTRICT,
  ADD CONSTRAINT petros_assignment_recipient_student_tenant_fk
    FOREIGN KEY (student_id, institution_id) REFERENCES students(id, institution_id) ON DELETE RESTRICT,
  ADD CONSTRAINT petros_assignment_recipient_session_owner_fk
    FOREIGN KEY (session_id, institution_id, student_id)
    REFERENCES petros_learning_sessions(id, institution_id, student_id) ON DELETE RESTRICT;

ALTER TABLE petros_assignment_learning_receipts
  ADD CONSTRAINT petros_assignment_receipt_release_tenant_fk
    FOREIGN KEY (release_id, institution_id)
    REFERENCES petros_assignment_learning_releases(id, institution_id) ON DELETE RESTRICT;

ALTER TABLE petros_assignment_learning_outbox
  ADD CONSTRAINT petros_assignment_outbox_release_tenant_fk
    FOREIGN KEY (release_id, institution_id)
    REFERENCES petros_assignment_learning_releases(id, institution_id) ON DELETE RESTRICT;

--> statement-breakpoint
-- Staff may read explicitly submitted work, but only a student acting as the exact
-- owner may create the row that grants that visibility.
DROP POLICY petros_qualitative_submissions_owner ON petros_qualitative_submissions;
CREATE POLICY petros_qualitative_submissions_read ON petros_qualitative_submissions FOR SELECT
  USING (institution_id::text = edrion_current_institution() AND
    (edrion_current_student() IS NULL OR student_id::text = edrion_current_student()));
CREATE POLICY petros_qualitative_submissions_insert ON petros_qualitative_submissions FOR INSERT
  WITH CHECK (institution_id::text = edrion_current_institution() AND
    student_id::text = edrion_current_student());
