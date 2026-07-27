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
      ('timetable_slots', 'institution_id'),
      -- Institution-portal exams/gradebook/assignments (Phase 6): tenant-isolated.
      ('exams', 'institution_id'),
      ('exam_schedules', 'institution_id'),
      ('grade_entries', 'institution_id'),
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
      -- Document issuance catalog/batches (tenant-scoped).
      ('document_catalog', 'institution_id'),
      ('document_batches', 'institution_id'),
      ('report_card_remarks', 'institution_id'),
      ('mark_release_batches', 'institution_id'),
      -- Student portal (Plan 03): institutional bridge tables.
      ('homework', 'institution_id'),
      ('class_stream_posts', 'institution_id'),
      ('class_materials', 'institution_id'),
      ('courses', 'institution_id'),
      ('course_enrollments', 'institution_id'),
      ('report_cards', 'institution_id')
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
CREATE OR REPLACE FUNCTION edrion_current_student() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.student_id', true), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION edrion_current_independent_user() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.independent_user_id', true), '');
$$ LANGUAGE sql STABLE;

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
-- Owner rows + published institution blueprints readable by students of that institution.
CREATE POLICY exam_blueprints_student_private ON exam_blueprints FOR ALL
USING (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student())
  OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
  OR (
    edrion_current_student() IS NOT NULL
    AND institution_id IS NOT NULL
    AND student_id IS NULL
    AND independent_user_id IS NULL
    AND is_published = true
    AND archived_at IS NULL
    AND (edrion_current_institution() IS NULL OR institution_id::text = edrion_current_institution())
  )
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
-- Global (institution_id NULL) + own-institution rows; pending items still readable for review UIs.
CREATE POLICY question_bank_read ON question_bank FOR SELECT USING (
  institution_id IS NULL
  OR edrion_current_institution() IS NULL
  OR institution_id::text = edrion_current_institution()
);
DROP POLICY IF EXISTS question_bank_write ON question_bank;
CREATE POLICY question_bank_write ON question_bank FOR INSERT WITH CHECK (
  institution_id IS NULL
  OR edrion_current_institution() IS NULL
  OR institution_id::text = edrion_current_institution()
);
DROP POLICY IF EXISTS question_bank_update ON question_bank;
CREATE POLICY question_bank_update ON question_bank FOR UPDATE USING (
  institution_id IS NULL
  OR edrion_current_institution() IS NULL
  OR institution_id::text = edrion_current_institution()
);

-- Today Feed: every personal table is dual-owner. institution_id is context only.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['user_obligations','feed_events','today_preferences'] LOOP
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

-- Dual-owner document vault (evolved student_document_vault).
ALTER TABLE student_document_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_document_vault FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_document_vault_owner_split ON student_document_vault;
CREATE POLICY student_document_vault_owner_split ON student_document_vault FOR ALL USING (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL AND edrion_current_institution() IS NULL)
  OR (
    institution_id IS NOT NULL AND student_id IS NOT NULL AND independent_user_id IS NULL
    AND (edrion_current_institution() IS NULL OR institution_id::text = edrion_current_institution())
    AND (edrion_current_student() IS NULL OR student_id::text = edrion_current_student())
  )
  OR (
    independent_user_id IS NOT NULL AND institution_id IS NULL AND student_id IS NULL
    AND (edrion_current_independent_user() IS NULL OR independent_user_id::text = edrion_current_independent_user())
  )
) WITH CHECK (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL AND edrion_current_institution() IS NULL)
  OR (
    institution_id IS NOT NULL AND student_id IS NOT NULL AND independent_user_id IS NULL
    AND (edrion_current_institution() IS NULL OR institution_id::text = edrion_current_institution())
  )
  OR (
    independent_user_id IS NOT NULL AND institution_id IS NULL AND student_id IS NULL
    AND (edrion_current_independent_user() IS NULL OR independent_user_id::text = edrion_current_independent_user())
  )
);

-- Edrion Learn orchestrator: owner-scoped tables.
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
        OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student()
            AND (institution_id IS NULL OR edrion_current_institution() IS NULL OR institution_id::text = edrion_current_institution()))
        OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
      ) WITH CHECK (
        (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
        OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student()
            AND (institution_id IS NULL OR edrion_current_institution() IS NULL OR institution_id::text = edrion_current_institution()))
        OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
      )', tbl, tbl
    );
  END LOOP;
END $$;

ALTER TABLE learn_topic_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_topic_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learn_topic_profiles_owner_private ON learn_topic_profiles;
CREATE POLICY learn_topic_profiles_owner_private ON learn_topic_profiles FOR ALL
USING (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
  OR (
    edrion_current_institution() IS NOT NULL
    AND institution_id::text = edrion_current_institution()
    AND independent_user_id IS NULL
  )
)
WITH CHECK (
  (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
  OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
  OR (
    edrion_current_institution() IS NOT NULL
    AND institution_id::text = edrion_current_institution()
    AND independent_user_id IS NULL
  )
);

-- learn_session_events: scoped via parent learn_sessions owner.
ALTER TABLE learn_session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_session_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learn_session_events_owner_private ON learn_session_events;
CREATE POLICY learn_session_events_owner_private ON learn_session_events FOR ALL
USING (EXISTS (
  SELECT 1 FROM learn_sessions ls
  WHERE ls.id = learn_session_events.session_id
    AND (
      (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
      OR (edrion_current_student() IS NOT NULL AND ls.student_id::text = edrion_current_student())
      OR (edrion_current_independent_user() IS NOT NULL AND ls.independent_user_id::text = edrion_current_independent_user())
    )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM learn_sessions ls
  WHERE ls.id = learn_session_events.session_id
    AND (
      (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
      OR (edrion_current_student() IS NOT NULL AND ls.student_id::text = edrion_current_student())
      OR (edrion_current_independent_user() IS NOT NULL AND ls.independent_user_id::text = edrion_current_independent_user())
    )
));

-- ─────────────────────────────────────────────────────────────────────────────
-- Edrion Learn, Phase C (D12/DM-104): the nine remaining Learn tables.
--
-- Before this block only learner_mastery, learner_model_events,
-- learn_topic_profiles and learn_session_events were covered. The rest —
-- learn_sessions, learn_session_blocks, learn_attempts, learn_ai_calls,
-- learning_paths, learning_path_items, quick_answers, revision_states,
-- evidence_tags — held learner-private work with no storage-layer isolation at
-- all. (learn_topics and concept_atoms are deliberately excluded: they are
-- shared curriculum assets with no learner owner, like exam_paper_patterns.)
--
-- NOTE ON BLAST RADIUS: the API currently connects as a superuser, which
-- implies BYPASSRLS, so nothing below can change the behaviour of the running
-- app today. These policies are defence-in-depth that becomes load-bearing the
-- moment the connection is moved to the `edrion_app` role the grants layer was
-- written for. They follow the existing conventions exactly: transaction-local
-- GUCs via edrion_current_student() / edrion_current_independent_user() /
-- edrion_current_institution(), an allow-all branch when both learner GUCs are
-- unset (migrations, seeds, platform jobs), and FORCE ROW LEVEL SECURITY.
-- ─────────────────────────────────────────────────────────────────────────────

-- Direct dual-owner tables that also carry institution_id as context.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['learn_sessions', 'learning_paths', 'quick_answers'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_owner_private ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_owner_private ON %I FOR ALL USING (
        (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
        OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student()
            AND (institution_id IS NULL OR edrion_current_institution() IS NULL OR institution_id::text = edrion_current_institution()))
        OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
      ) WITH CHECK (
        (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
        OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student()
            AND (institution_id IS NULL OR edrion_current_institution() IS NULL OR institution_id::text = edrion_current_institution()))
        OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
      )', tbl, tbl
    );
  END LOOP;
END $$;

-- Direct dual-owner tables with no institution_id column.
-- learn_ai_calls is the append-only cost ledger: its owner FKs are ON DELETE
-- SET NULL, so an ownerless row is legitimate and simply becomes invisible to
-- any learner-scoped transaction — which is the desired outcome.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['learn_attempts', 'revision_states', 'evidence_tags', 'learn_ai_calls'] LOOP
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

-- learn_session_blocks: scoped via parent learn_sessions owner (same shape as
-- learn_session_events above).
ALTER TABLE learn_session_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_session_blocks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learn_session_blocks_owner_private ON learn_session_blocks;
CREATE POLICY learn_session_blocks_owner_private ON learn_session_blocks FOR ALL
USING (EXISTS (
  SELECT 1 FROM learn_sessions ls
  WHERE ls.id = learn_session_blocks.session_id
    AND (
      (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
      OR (edrion_current_student() IS NOT NULL AND ls.student_id::text = edrion_current_student())
      OR (edrion_current_independent_user() IS NOT NULL AND ls.independent_user_id::text = edrion_current_independent_user())
    )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM learn_sessions ls
  WHERE ls.id = learn_session_blocks.session_id
    AND (
      (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
      OR (edrion_current_student() IS NOT NULL AND ls.student_id::text = edrion_current_student())
      OR (edrion_current_independent_user() IS NOT NULL AND ls.independent_user_id::text = edrion_current_independent_user())
    )
));

-- learning_path_items: scoped via parent learning_paths owner.
ALTER TABLE learning_path_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_path_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learning_path_items_owner_private ON learning_path_items;
CREATE POLICY learning_path_items_owner_private ON learning_path_items FOR ALL
USING (EXISTS (
  SELECT 1 FROM learning_paths lp
  WHERE lp.id = learning_path_items.path_id
    AND (
      (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
      OR (edrion_current_student() IS NOT NULL AND lp.student_id::text = edrion_current_student())
      OR (edrion_current_independent_user() IS NOT NULL AND lp.independent_user_id::text = edrion_current_independent_user())
    )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM learning_paths lp
  WHERE lp.id = learning_path_items.path_id
    AND (
      (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
      OR (edrion_current_student() IS NOT NULL AND lp.student_id::text = edrion_current_student())
      OR (edrion_current_independent_user() IS NOT NULL AND lp.independent_user_id::text = edrion_current_independent_user())
    )
));
