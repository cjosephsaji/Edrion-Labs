-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security: tenant (institution) isolation, LAYERED UNDER the API guard.
-- Applied after zzz_grants.sql by src/migrate.ts. Idempotent.
--
-- This is defence-in-depth, never the primary control. The API's permission guard remains
-- authoritative for WHAT an employee may do. RLS guarantees that when a request runs inside an
-- institution-scoped context (a support-access session), the database itself cannot return or
-- mutate another institution's rows — even a mis-scoped query is blocked at the storage layer.
--
-- Mechanism: the app sets a per-transaction GUC `app.institution_id`. When it is UNSET/empty
-- (the normal platform-wide employee view, already authorised by the guard) every row is
-- visible. When set, only that institution's rows are. The application role `edrion_app` is a
-- non-superuser without BYPASSRLS, so the policies bind to it; the migration/superuser
-- connection bypasses RLS (so dev — which connects as a superuser — is unaffected).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER ROLE edrion_app NOBYPASSRLS;

-- The active institution scope for this transaction, or NULL when platform-wide.
CREATE OR REPLACE FUNCTION edrion_current_institution() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.institution_id', true), '');
$$ LANGUAGE sql STABLE;

-- Student / independent learner scope (required by learn + visual RLS in Drizzle migrations).
CREATE OR REPLACE FUNCTION edrion_current_student() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.student_id', true), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION edrion_current_independent_user() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.independent_user_id', true), '');
$$ LANGUAGE sql STABLE;

-- institutions: keyed by id. Others: keyed by institution_id.
DO $$
DECLARE
  spec record;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('institutions', 'id'),
      ('campuses', 'institution_id'),
      ('institution_users', 'institution_id'),
      ('subscriptions', 'institution_id'),
      ('invoices', 'institution_id'),
      ('webhook_endpoints', 'institution_id'),
      -- Institution-portal academic structure (Phase 2): tenant-isolated under the API guard.
      ('academic_years', 'institution_id'),
      ('departments', 'institution_id'),
      ('grade_levels', 'institution_id'),
      ('department_grade_levels', 'institution_id'),
      ('academic_terms', 'institution_id'),
      ('subjects', 'institution_id'),
      ('programme_subjects', 'institution_id'),
      ('classes', 'institution_id'),
      ('class_subject_teachers', 'institution_id'),
      -- Institution-portal people directory (Phase 4): tenant-isolated under the API guard.
      ('students', 'institution_id'),
      ('staff', 'institution_id'),
      ('parents', 'institution_id'),
      ('student_guardians', 'institution_id'),
      ('student_enrollments', 'institution_id'),
      ('staff_assignments', 'institution_id'),
      -- Institution-portal admissions/attendance/timetable (Phase 5): tenant-isolated.
      ('admission_applications', 'institution_id'),
      ('attendance_sessions', 'institution_id'),
      ('attendance_records', 'institution_id'),
      ('attendance_policies', 'institution_id'),
      ('attendance_rollups', 'institution_id'),
      ('request_marks_pending', 'institution_id'),
      ('timetable_slots', 'institution_id'),
      ('period_exceptions', 'institution_id'),
      ('ics_tokens', 'institution_id'),
      -- Institution-portal exams/gradebook/assignments (Phase 6): tenant-isolated.
      ('exams', 'institution_id'),
      ('exam_schedules', 'institution_id'),
      ('grade_entries', 'institution_id'),
      ('grading_schemes', 'institution_id'),
      ('grading_scheme_versions', 'institution_id'),
      ('subject_weight_maps', 'institution_id'),
      ('mark_release_batches', 'institution_id'),
      ('student_term_results', 'institution_id'),
      ('student_cgpa_snapshots', 'institution_id'),
      ('mark_revisions', 'institution_id'),
      ('term_recompute_requests', 'institution_id'),
      ('assignments', 'institution_id'),
      ('assignment_submissions', 'institution_id'),
      -- Institution-portal fees/payroll (Phase 7): tenant-isolated under the API guard.
      ('fee_structures', 'institution_id'),
      ('fee_invoices', 'institution_id'),
      ('fee_payments', 'institution_id'),
      ('payroll_runs', 'institution_id'),
      ('payroll_items', 'institution_id'),
      -- School expenses (money out; Finance Manager): tenant-isolated under the API guard.
      ('school_expenses', 'institution_id'),
      -- Institution-portal library/transport/inventory/hostel (Phase 8): tenant-isolated.
      ('library_books', 'institution_id'),
      ('library_loans', 'institution_id'),
      ('transport_routes', 'institution_id'),
      ('transport_vehicles', 'institution_id'),
      ('transport_assignments', 'institution_id'),
      ('inventory_items', 'institution_id'),
      ('inventory_movements', 'institution_id'),
      ('hostel_blocks', 'institution_id'),
      ('hostel_rooms', 'institution_id'),
      ('hostel_allocations', 'institution_id'),
      -- Institution-portal announcements/messages/notifications/reports (Phase 9): tenant-isolated.
      ('announcements', 'institution_id'),
      ('notifications', 'institution_id'),
      ('message_threads', 'institution_id'),
      ('message_posts', 'institution_id'),
      ('report_definitions', 'institution_id'),
      ('report_runs', 'institution_id'),
      -- Institution-portal Copilot run lifecycle (Phase 10): tenant-isolated under the API guard.
      ('portal_ai_runs', 'institution_id'),
      ('portal_ai_tool_calls', 'institution_id'),
      ('portal_ai_confirmations', 'institution_id'),
      -- Institution-portal administration (Phase 11): settings tree + custom roles, tenant-isolated.
      ('institution_settings', 'institution_id'),
      ('fee_structure_versions', 'institution_id'),
      ('fee_invoice_items', 'institution_id'),
      ('fee_receipts', 'institution_id'),
      ('fee_receipt_sequences', 'institution_id'),
      ('fee_waivers', 'institution_id'),
      ('institution_fee_config', 'institution_id'),
      ('institution_roles', 'institution_id'),
      -- Institution-portal real auth (Phase 12): server sessions + invitations, tenant-isolated.
      ('portal_sessions', 'institution_id'),
      ('portal_invitations', 'institution_id'),
      -- Phase 13: functional staff modules (health/counseling/labs/front-desk/facilities/security/it).
      ('health_records', 'institution_id'),
      ('medical_incidents', 'institution_id'),
      ('medication_logs', 'institution_id'),
      ('counseling_records', 'institution_id'),
      ('counseling_cases', 'institution_id'),
      ('lab_assets', 'institution_id'),
      ('lab_schedules', 'institution_id'),
      ('lab_incidents', 'institution_id'),
      ('visitors', 'institution_id'),
      ('appointments', 'institution_id'),
      ('facilities', 'institution_id'),
      ('work_orders', 'institution_id'),
      ('maintenance_tasks', 'institution_id'),
      ('facility_assets', 'institution_id'),
      ('gate_passes', 'institution_id'),
      ('security_incidents', 'institution_id'),
      ('emergency_alerts', 'institution_id'),
      ('campus_access_logs', 'institution_id'),
      ('devices', 'institution_id'),
      ('access_requests', 'institution_id'),
      -- Onboarding checklist generated on registration approval: tenant-isolated.
      ('institution_onboarding_tasks', 'institution_id'),
      -- Admin-redesign Phase 3: recipient targeting for announcements/notifications.
      ('recipient_groups', 'institution_id'),
      ('recipient_group_members', 'institution_id'),
      ('announcement_targets', 'institution_id'),
      -- Admin-redesign Phase 4: messaging v2 (conversations/participants/messages/attachments).
      ('conversations', 'institution_id'),
      ('conversation_participants', 'institution_id'),
      ('messages', 'institution_id'),
      ('message_attachments', 'institution_id'),
      -- Institution-portal Documents & Policies (Administration).
      ('institution_documents', 'institution_id'),
      -- Institution-portal student conduct log (behaviour incidents + complaints).
      ('student_incidents', 'institution_id'),
      -- Petros (AI assistant) chat persistence.
      ('petros_conversations', 'institution_id'),
      ('petros_messages', 'institution_id'),
      ('petros_artifacts', 'institution_id'),
      ('petros_attachments', 'institution_id'),
      ('petros_pending_turns', 'institution_id'),
      -- Document generation renders (templates stay unlisted: NULL institution_id = platform default).
      ('document_renders', 'institution_id'),
      ('petros_decline_stats', 'institution_id'),
      -- Parent Portal (all tenant-isolated; guardian-row scoping is enforced by GuardianScopeGuard).
      ('parent_notices', 'institution_id'),
      ('parent_notice_receipts', 'institution_id'),
      ('parent_message_threads', 'institution_id'),
      ('parent_messages', 'institution_id'),
      ('parent_emergency_broadcasts', 'institution_id'),
      ('calendar_events', 'institution_id'),
      ('calendar_event_types', 'institution_id'),
      ('parent_consent_forms', 'institution_id'),
      ('parent_consent_responses', 'institution_id'),
      ('parent_ptm_events', 'institution_id'),
      ('parent_ptm_slots', 'institution_id'),
      ('parent_ptm_bookings', 'institution_id'),
      ('parent_absence_notes', 'institution_id'),
      ('parent_notifications', 'institution_id'),
      ('parent_notification_preferences', 'institution_id'),
      ('parent_digest_runs', 'institution_id'),
      ('parent_digest_deliveries', 'institution_id'),
      ('parent_health_profiles', 'institution_id'),
      ('student_recognitions', 'institution_id'),
      ('counseling_disclosures', 'institution_id'),
      ('pickup_authorizations', 'institution_id'),
      ('early_leave_requests', 'institution_id'),
      ('gate_exit_events', 'institution_id'),
      ('transport_incidents', 'institution_id'),
      ('hostel_outing_requests', 'institution_id'),
      ('parent_payment_intents', 'institution_id'),
      ('student_documents', 'institution_id'),
      ('document_requests', 'institution_id'),
      ('profile_change_requests', 'institution_id'),
      -- Student portal (Plan 01): tenant-isolated institutional tables.
      ('storage_objects', 'institution_id'),
      ('student_content_pages', 'institution_id'),
      -- Student Request Engine: operational request/event/config/vault records.
      ('student_requests', 'institution_id'),
      ('student_request_events', 'institution_id'),
      ('institution_request_type_config', 'institution_id'),
      ('student_document_vault', 'institution_id'),
      ('sensitive_report_audit_log', 'institution_id'),
      ('sensitive_report_unseal_approvals', 'institution_id'),
      ('student_sensitive_report_ownership', 'institution_id'),
      ('principal_metric_rollups', 'institution_id'),
      ('institution_identity_providers', 'institution_id'),
      ('roster_sync_jobs', 'institution_id'),
      ('library_fine_invoice_links', 'institution_id'),
      ('clubs', 'institution_id'),
      ('campus_events', 'institution_id'),
      ('placement_seasons', 'institution_id'),
      -- Student portal (Plan 03): institutional bridge tables.
      ('homework', 'institution_id'),
      ('class_stream_posts', 'institution_id'),
      ('class_materials', 'institution_id'),
      ('courses', 'institution_id'),
      ('course_enrollments', 'institution_id'),
      ('report_cards', 'institution_id'),
      -- Library review / workspace (Phase 1): nullable institution_id context tag.
      ('review_sessions', 'institution_id'),
      ('user_streaks', 'institution_id'),
      ('streak_events', 'institution_id'),
      ('knowledge_chunks', 'institution_id'),
      ('knowledge_item_chats', 'institution_id'),
      ('generation_jobs', 'institution_id'),
      ('library_notes', 'institution_id'),
      ('user_review_prefs', 'institution_id')
    ) AS t(tbl, col)
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', spec.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON %I', spec.tbl, spec.tbl);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I FOR ALL
         USING (edrion_current_institution() IS NULL OR %I::text = edrion_current_institution())
         WITH CHECK (edrion_current_institution() IS NULL OR %I::text = edrion_current_institution())',
      spec.tbl, spec.tbl, spec.col, spec.col
    );
  END LOOP;
END
$$;

-- Visual Studio: strict student-private policies (not institution-wide).
ALTER TABLE visual_canvases ENABLE ROW LEVEL SECURITY;
ALTER TABLE visual_canvases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS visual_canvases_student_private ON visual_canvases;
CREATE POLICY visual_canvases_student_private ON visual_canvases FOR ALL
USING (
  (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student())
  OR
  (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
)
WITH CHECK (
  (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student())
  OR
  (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
);

ALTER TABLE visual_canvas_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE visual_canvas_revisions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS visual_canvas_revisions_student_private ON visual_canvas_revisions;
CREATE POLICY visual_canvas_revisions_student_private ON visual_canvas_revisions FOR ALL
USING (EXISTS (
  SELECT 1 FROM visual_canvases vc
  WHERE vc.id = visual_canvas_revisions.canvas_id
    AND (
      (edrion_current_student() IS NOT NULL AND vc.student_id::text = edrion_current_student())
      OR
      (edrion_current_independent_user() IS NOT NULL AND vc.independent_user_id::text = edrion_current_independent_user())
    )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM visual_canvases vc
  WHERE vc.id = visual_canvas_revisions.canvas_id
    AND (
      (edrion_current_student() IS NOT NULL AND vc.student_id::text = edrion_current_student())
      OR
      (edrion_current_independent_user() IS NOT NULL AND vc.independent_user_id::text = edrion_current_independent_user())
    )
));

-- Exam engine: student-private mock exams / blueprints (never institution-readable via RLS).
-- When student GUCs are unset (platform/migration), policies allow all (same pattern as visual when GUC empty would block —
-- FORCE RLS with empty GUC denies; API sets GUCs in student tenant interceptor. For migrate/seed superuser bypasses RLS.)

ALTER TABLE exam_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_blueprints FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exam_blueprints_student_private ON exam_blueprints;
CREATE POLICY exam_blueprints_student_private ON exam_blueprints FOR ALL
USING (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student())
  OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
)
WITH CHECK (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student())
  OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
);

ALTER TABLE mock_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_exams FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mock_exams_student_private ON mock_exams;
CREATE POLICY mock_exams_student_private ON mock_exams FOR ALL
USING (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student())
  OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
)
WITH CHECK (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student())
  OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
);

ALTER TABLE mock_exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_exam_questions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mock_exam_questions_student_private ON mock_exam_questions;
CREATE POLICY mock_exam_questions_student_private ON mock_exam_questions FOR ALL
USING (EXISTS (
  SELECT 1 FROM mock_exams me WHERE me.id = mock_exam_questions.mock_exam_id
    AND (
      (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
      OR (edrion_current_student() IS NOT NULL AND me.student_id::text = edrion_current_student())
      OR (edrion_current_independent_user() IS NOT NULL AND me.independent_user_id::text = edrion_current_independent_user())
    )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM mock_exams me WHERE me.id = mock_exam_questions.mock_exam_id
    AND (
      (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
      OR (edrion_current_student() IS NOT NULL AND me.student_id::text = edrion_current_student())
      OR (edrion_current_independent_user() IS NOT NULL AND me.independent_user_id::text = edrion_current_independent_user())
    )
));

ALTER TABLE mock_exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_exam_attempts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mock_exam_attempts_student_private ON mock_exam_attempts;
CREATE POLICY mock_exam_attempts_student_private ON mock_exam_attempts FOR ALL
USING (EXISTS (
  SELECT 1 FROM mock_exams me WHERE me.id = mock_exam_attempts.mock_exam_id
    AND (
      (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
      OR (edrion_current_student() IS NOT NULL AND me.student_id::text = edrion_current_student())
      OR (edrion_current_independent_user() IS NOT NULL AND me.independent_user_id::text = edrion_current_independent_user())
    )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM mock_exams me WHERE me.id = mock_exam_attempts.mock_exam_id
    AND (
      (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
      OR (edrion_current_student() IS NOT NULL AND me.student_id::text = edrion_current_student())
      OR (edrion_current_independent_user() IS NOT NULL AND me.independent_user_id::text = edrion_current_independent_user())
    )
));

ALTER TABLE mock_exam_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_exam_answers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mock_exam_answers_student_private ON mock_exam_answers;
CREATE POLICY mock_exam_answers_student_private ON mock_exam_answers FOR ALL
USING (EXISTS (
  SELECT 1 FROM mock_exam_attempts a
  JOIN mock_exams me ON me.id = a.mock_exam_id
  WHERE a.id = mock_exam_answers.attempt_id
    AND (
      (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
      OR (edrion_current_student() IS NOT NULL AND me.student_id::text = edrion_current_student())
      OR (edrion_current_independent_user() IS NOT NULL AND me.independent_user_id::text = edrion_current_independent_user())
    )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM mock_exam_attempts a
  JOIN mock_exams me ON me.id = a.mock_exam_id
  WHERE a.id = mock_exam_answers.attempt_id
    AND (
      (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
      OR (edrion_current_student() IS NOT NULL AND me.student_id::text = edrion_current_student())
      OR (edrion_current_independent_user() IS NOT NULL AND me.independent_user_id::text = edrion_current_independent_user())
    )
));

ALTER TABLE question_exposure ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_exposure FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS question_exposure_student_private ON question_exposure;
CREATE POLICY question_exposure_student_private ON question_exposure FOR ALL
USING (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student())
  OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
)
WITH CHECK (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student())
  OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
);

-- Paper patterns + question_bank are shared curriculum assets (readable when GUCs unset or set).
ALTER TABLE exam_paper_patterns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exam_paper_patterns_read ON exam_paper_patterns;
CREATE POLICY exam_paper_patterns_read ON exam_paper_patterns FOR SELECT USING (true);

ALTER TABLE question_bank ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS question_bank_read ON question_bank;
CREATE POLICY question_bank_read ON question_bank FOR SELECT USING (true);
DROP POLICY IF EXISTS question_bank_write ON question_bank;
CREATE POLICY question_bank_write ON question_bank FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS question_bank_update ON question_bank;
CREATE POLICY question_bank_update ON question_bank FOR UPDATE USING (true);

-- Today Feed: every personal table is dual-owner. institution_id is context only.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['user_obligations','feed_events','today_preferences',
    'review_sessions','user_streaks','streak_events','knowledge_chunks','knowledge_item_chats',
    'generation_jobs','library_notes','user_review_prefs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_owner_private ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_owner_private ON %I FOR ALL USING (
        (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
        OR (edrion_current_student() IS NOT NULL AND student_id::text=edrion_current_student()
            AND (institution_id IS NULL OR edrion_current_institution() IS NULL OR institution_id::text=edrion_current_institution()))
        OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text=edrion_current_independent_user())
      ) WITH CHECK (
        (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
        OR (edrion_current_student() IS NOT NULL AND student_id::text=edrion_current_student()
            AND (institution_id IS NULL OR edrion_current_institution() IS NULL OR institution_id::text=edrion_current_institution()))
        OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text=edrion_current_independent_user())
      )', tbl, tbl
    );
  END LOOP;
END $$;

-- Edrion Learn orchestrator (0097): student-private learner state.
ALTER TABLE learn_topic_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_topic_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learn_topic_profiles_owner_private ON learn_topic_profiles;
CREATE POLICY learn_topic_profiles_owner_private ON learn_topic_profiles FOR ALL
USING (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
  OR (
    edrion_current_institution() IS NOT NULL
    AND institution_id IS NOT NULL
    AND institution_id::text = edrion_current_institution()
    AND independent_user_id IS NULL
  )
)
WITH CHECK (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
  OR (
    edrion_current_institution() IS NOT NULL
    AND institution_id IS NOT NULL
    AND institution_id::text = edrion_current_institution()
    AND independent_user_id IS NULL
  )
);

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['learner_mastery', 'learner_model_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_owner_private ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_owner_private ON %I FOR ALL USING (
        (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
        OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student())
        OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
      ) WITH CHECK (
        (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
        OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student())
        OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
      )', tbl, tbl
    );
  END LOOP;
END $$;

ALTER TABLE learn_session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_session_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learn_session_events_owner_private ON learn_session_events;
CREATE POLICY learn_session_events_owner_private ON learn_session_events FOR ALL
USING (EXISTS (
  SELECT 1 FROM learn_sessions ls WHERE ls.id = learn_session_events.session_id
    AND (
      (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
      OR (edrion_current_student() IS NOT NULL AND ls.student_id::text = edrion_current_student())
      OR (edrion_current_independent_user() IS NOT NULL AND ls.independent_user_id::text = edrion_current_independent_user())
    )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM learn_sessions ls WHERE ls.id = learn_session_events.session_id
    AND (
      (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
      OR (edrion_current_student() IS NOT NULL AND ls.student_id::text = edrion_current_student())
      OR (edrion_current_independent_user() IS NOT NULL AND ls.independent_user_id::text = edrion_current_independent_user())
    )
));

-- Debate P1 (0110): owner-scoped rounds and artefacts.
ALTER TABLE debates ENABLE ROW LEVEL SECURITY;
ALTER TABLE debates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS debates_owner_private ON debates;
CREATE POLICY debates_owner_private ON debates FOR ALL
USING (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student())
  OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
)
WITH CHECK (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student())
  OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
);

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'debate_participants', 'debate_turns', 'debate_consents', 'debate_transcripts',
    'debate_adjudication_runs', 'debate_speech_analyses', 'debate_clashes', 'debate_verdicts',
    'debate_speaker_scores', 'debate_feedback_reports', 'debate_ai_opponent_scripts'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_via_debate ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_via_debate ON %I FOR ALL USING (
        EXISTS (
          SELECT 1 FROM debates d WHERE d.id = %I.debate_id
            AND (
              (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
              OR (edrion_current_student() IS NOT NULL AND d.student_id::text = edrion_current_student())
              OR (edrion_current_independent_user() IS NOT NULL AND d.independent_user_id::text = edrion_current_independent_user())
            )
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM debates d WHERE d.id = %I.debate_id
            AND (
              (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
              OR (edrion_current_student() IS NOT NULL AND d.student_id::text = edrion_current_student())
              OR (edrion_current_independent_user() IS NOT NULL AND d.independent_user_id::text = edrion_current_independent_user())
            )
        )
      )', tbl, tbl, tbl, tbl
    );
  END LOOP;
END $$;

ALTER TABLE debate_prep_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE debate_prep_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS debate_prep_notes_owner_private ON debate_prep_notes;
CREATE POLICY debate_prep_notes_owner_private ON debate_prep_notes FOR ALL
USING (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student())
  OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
)
WITH CHECK (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student())
  OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
);

ALTER TABLE debate_skill_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE debate_skill_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS debate_skill_snapshots_owner_private ON debate_skill_snapshots;
CREATE POLICY debate_skill_snapshots_owner_private ON debate_skill_snapshots FOR ALL
USING (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student())
  OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
)
WITH CHECK (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student())
  OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
);

ALTER TABLE debate_adjudication_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE debate_adjudication_calls FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS debate_adjudication_calls_via_run ON debate_adjudication_calls;
CREATE POLICY debate_adjudication_calls_via_run ON debate_adjudication_calls FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM debate_adjudication_runs r
    JOIN debates d ON d.id = r.debate_id
    WHERE r.id = debate_adjudication_calls.run_id
      AND (
        (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
        OR (edrion_current_student() IS NOT NULL AND d.student_id::text = edrion_current_student())
        OR (edrion_current_independent_user() IS NOT NULL AND d.independent_user_id::text = edrion_current_independent_user())
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM debate_adjudication_runs r
    JOIN debates d ON d.id = r.debate_id
    WHERE r.id = debate_adjudication_calls.run_id
      AND (
        (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
        OR (edrion_current_student() IS NOT NULL AND d.student_id::text = edrion_current_student())
        OR (edrion_current_independent_user() IS NOT NULL AND d.independent_user_id::text = edrion_current_independent_user())
      )
  )
);
