SET lock_timeout='2s';
SET statement_timeout='15s';
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
      -- Document issuance catalog/batches (tenant-scoped).
      ('document_catalog', 'institution_id'),
      ('document_batches', 'institution_id'),
      ('report_card_remarks', 'institution_id'),
      ('mark_release_batches', 'institution_id'),
      -- Student portal (Plan 03): institutional bridge tables.
      ('homework', 'institution_id'),
      ('class_stream_posts', 'institution_id'),
      ('class_materials', 'institution_id'),
      ('class_notes', 'institution_id'),
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

-- learn_topic_profiles (v1) — kept only while the table still exists on a DB.
DO $$
BEGIN
  IF to_regclass('public.learn_topic_profiles') IS NOT NULL THEN
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
  END IF;
END $$;

-- learn_topic_shapes (v2) — same owner-private pattern as profiles.
DO $$
BEGIN
  IF to_regclass('public.learn_topic_shapes') IS NOT NULL THEN
    ALTER TABLE learn_topic_shapes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE learn_topic_shapes FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS learn_topic_shapes_owner_private ON learn_topic_shapes;
    CREATE POLICY learn_topic_shapes_owner_private ON learn_topic_shapes FOR ALL
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
  END IF;
END $$;

-- learn_config + learner_model_state — owner-private (were missing after 0109 recreate).
DO $$
BEGIN
  IF to_regclass('public.learn_config') IS NOT NULL THEN
    ALTER TABLE learn_config ENABLE ROW LEVEL SECURITY;
    ALTER TABLE learn_config FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS learn_config_owner_private ON learn_config;
    CREATE POLICY learn_config_owner_private ON learn_config FOR ALL
    USING (
      (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
      OR scope = 'global'
      OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
      OR (
        edrion_current_institution() IS NOT NULL
        AND institution_id::text = edrion_current_institution()
        AND independent_user_id IS NULL
      )
    )
    WITH CHECK (
      (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
      OR scope = 'global'
      OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
      OR (
        edrion_current_institution() IS NOT NULL
        AND institution_id::text = edrion_current_institution()
        AND independent_user_id IS NULL
      )
    );
  END IF;

  IF to_regclass('public.learner_model_state') IS NOT NULL THEN
    ALTER TABLE learner_model_state ENABLE ROW LEVEL SECURITY;
    ALTER TABLE learner_model_state FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS learner_model_state_owner_private ON learner_model_state;
    CREATE POLICY learner_model_state_owner_private ON learner_model_state FOR ALL
    USING (
      (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
      OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student()
          AND (institution_id IS NULL OR edrion_current_institution() IS NULL OR institution_id::text = edrion_current_institution()))
      OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
    )
    WITH CHECK (
      (edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)
      OR (edrion_current_student() IS NOT NULL AND student_id::text = edrion_current_student()
          AND (institution_id IS NULL OR edrion_current_institution() IS NULL OR institution_id::text = edrion_current_institution()))
      OR (edrion_current_independent_user() IS NOT NULL AND independent_user_id::text = edrion_current_independent_user())
    );
  END IF;
END $$;

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

-- M0-R: retain the final repair overlay on every ordered standalone replay.
-- GUCs are set only by trusted server code after principal verification; they are
-- not a defence against arbitrary SQL execution with a stolen application secret.
CREATE OR REPLACE FUNCTION public.edrion_petros_owner(i uuid, s uuid, u uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(
  (i::text=public.edrion_current_institution() AND s::text=public.edrion_current_student()
   AND u IS NULL AND public.edrion_current_independent_user() IS NULL
   AND EXISTS(SELECT 1 FROM public.students st JOIN public.institution_users iu ON iu.id=st.institution_user_id AND iu.institution_id=i
    WHERE st.id=s AND st.institution_id=i AND st.status='enrolled' AND iu.status='active'))
  OR (i IS NULL AND s IS NULL AND u::text=public.edrion_current_independent_user()
   AND public.edrion_current_institution() IS NULL AND public.edrion_current_student() IS NULL),false)
$$;
-- Restrictive policies compose with existing permissive policies; none can OR
-- around the owner predicate. Cover direct-owner Petros tables already installed.
DO $$ DECLARE r record; predicate text; BEGIN
 FOR r IN SELECT c.table_name,
   EXISTS(SELECT 1 FROM information_schema.columns d WHERE d.table_schema='public' AND d.table_name=c.table_name AND d.column_name='independent_user_id') AS independent
   FROM information_schema.columns c WHERE c.table_schema='public' AND c.column_name='student_id'
    AND (c.table_name LIKE 'petros_%' OR c.table_name IN('knowledge_items','knowledge_collections','knowledge_artifacts'))
    AND EXISTS(SELECT 1 FROM information_schema.columns d WHERE d.table_schema='public' AND d.table_name=c.table_name AND d.column_name='institution_id')
 LOOP
  predicate:=format('public.edrion_petros_owner(institution_id,student_id,%s)', CASE WHEN r.independent THEN 'independent_user_id' ELSE 'NULL::uuid' END);
  IF EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname='session_id' AND a.attnum=ANY(c.conkey)
    WHERE c.conrelid=to_regclass('public.'||r.table_name) AND c.confrelid='public.petros_learning_sessions'::regclass AND c.contype='f') THEN
   predicate:=predicate || format(' AND EXISTS(SELECT 1 FROM public.petros_learning_sessions s WHERE s.id=%I.session_id AND s.institution_id=%I.institution_id AND s.student_id=%I.student_id)',r.table_name,r.table_name,r.table_name);
  END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',r.table_name);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',r.table_name);
  EXECUTE format('DROP POLICY IF EXISTS m0r_owner_allow ON public.%I',r.table_name);
  EXECUTE format('DROP POLICY IF EXISTS m0r_owner_guard ON public.%I',r.table_name);
  EXECUTE format('CREATE POLICY m0r_owner_allow ON public.%I FOR ALL TO edrion_app,edrion_petros_document_worker USING (%s) WITH CHECK (%s)',r.table_name,predicate,predicate);
  EXECUTE format('CREATE POLICY m0r_owner_guard ON public.%I AS RESTRICTIVE FOR ALL TO edrion_app,edrion_petros_document_worker USING (%s) WITH CHECK (%s)',r.table_name,predicate,predicate);
 END LOOP;
END $$;
-- Child pages cannot be reached by bypassing the parent owner check.
ALTER TABLE public.knowledge_item_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_item_pages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS m0r_page_allow ON public.knowledge_item_pages;
DROP POLICY IF EXISTS m0r_page_guard ON public.knowledge_item_pages;
CREATE POLICY m0r_page_allow ON public.knowledge_item_pages FOR ALL TO edrion_app,edrion_petros_document_worker
 USING(EXISTS(SELECT 1 FROM public.knowledge_items k WHERE k.id=item_id))
 WITH CHECK(EXISTS(SELECT 1 FROM public.knowledge_items k WHERE k.id=item_id));
CREATE POLICY m0r_page_guard ON public.knowledge_item_pages AS RESTRICTIVE FOR ALL TO edrion_app,edrion_petros_document_worker
 USING(EXISTS(SELECT 1 FROM public.knowledge_items k WHERE k.id=item_id))
 WITH CHECK(EXISTS(SELECT 1 FROM public.knowledge_items k WHERE k.id=item_id));

-- Fail closed for institutional topic configuration and the eight previously
-- non-FORCE tables. More permissive legacy tenant policies cannot bypass this.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['assignments','petros_conversations','petros_messages','petros_artifacts','petros_attachments','petros_pending_turns','petros_decline_stats','petros_topic_profile_overrides','petros_topic_profile_audits'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS m0r_tenant_allow ON public.%I',t);
  EXECUTE format('DROP POLICY IF EXISTS m0r_tenant_guard ON public.%I',t);
  EXECUTE format('CREATE POLICY m0r_tenant_allow ON public.%I FOR ALL TO edrion_app USING (institution_id::text=public.edrion_current_institution()) WITH CHECK (institution_id::text=public.edrion_current_institution())',t);
  EXECUTE format('CREATE POLICY m0r_tenant_guard ON public.%I AS RESTRICTIVE FOR ALL TO edrion_app USING (institution_id::text=public.edrion_current_institution()) WITH CHECK (institution_id::text=public.edrion_current_institution())',t);
 END LOOP;
END $$;
-- Conversations are private to the authenticated institution user as well.
DROP POLICY IF EXISTS m0r_conversation_owner ON public.petros_conversations;
CREATE POLICY m0r_conversation_owner ON public.petros_conversations AS RESTRICTIVE FOR ALL TO edrion_app
 USING(institution_user_id::text=NULLIF(current_setting('app.institution_user_id',true),''))
 WITH CHECK(institution_user_id::text=NULLIF(current_setting('app.institution_user_id',true),''));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['petros_messages','petros_artifacts','petros_attachments','petros_pending_turns'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS m0r_conversation_parent ON public.%I',t);
  EXECUTE format('CREATE POLICY m0r_conversation_parent ON public.%I AS RESTRICTIVE FOR ALL TO edrion_app USING(EXISTS(SELECT 1 FROM public.petros_conversations c WHERE c.id=conversation_id)) WITH CHECK(EXISTS(SELECT 1 FROM public.petros_conversations c WHERE c.id=conversation_id))',t);
 END LOOP;
END $$;
ALTER TABLE public.assignment_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_assignees FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS m0r_assignees ON public.assignment_assignees;
CREATE POLICY m0r_assignees ON public.assignment_assignees FOR ALL TO edrion_app
 USING(EXISTS(SELECT 1 FROM public.assignments a WHERE a.id=assignment_id)
   AND (student_id::text=public.edrion_current_student() OR
    (public.edrion_current_student() IS NULL AND public.edrion_current_institution() IS NOT NULL AND public.edrion_current_independent_user() IS NULL)))
 WITH CHECK(EXISTS(SELECT 1 FROM public.assignments a WHERE a.id=assignment_id)
   AND (student_id::text=public.edrion_current_student() OR
    (public.edrion_current_student() IS NULL AND public.edrion_current_institution() IS NOT NULL AND public.edrion_current_independent_user() IS NULL)));

-- Storage retains legitimate class/course material reads, without granting all
-- institutional students access to each other's personal objects.
CREATE OR REPLACE FUNCTION public.edrion_petros_material_visible(m uuid, i uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.class_materials cm WHERE cm.id=m AND cm.institution_id=i
  AND i::text=public.edrion_current_institution() AND
  ((cm.context_type='class' AND EXISTS(SELECT 1 FROM public.students s WHERE s.id::text=public.edrion_current_student() AND s.institution_id=i AND s.class_id=cm.context_id))
   OR (cm.context_type='course' AND EXISTS(SELECT 1 FROM public.course_enrollments e JOIN public.courses c ON c.id=e.course_id
    WHERE e.student_id::text=public.edrion_current_student() AND e.institution_id=i AND c.institution_id=i AND c.status='active' AND c.id=cm.context_id))))
$$;
CREATE OR REPLACE FUNCTION public.edrion_petros_guidance_file_visible(o uuid,i uuid,b jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.assignments a JOIN public.assignment_assignees s ON s.assignment_id=a.id
  WHERE a.institution_id=i AND a.status='published' AND s.student_id::text=public.edrion_current_student()
   AND COALESCE(a.petros_guidance->'attachmentObjectIds','[]'::jsonb) @> jsonb_build_array(o::text)
   AND b->>'classId'=a.class_id::text AND b->>'subjectId'=a.subject_id::text)
$$;
ALTER TABLE public.storage_objects FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS m0r_storage_guard ON public.storage_objects;
CREATE POLICY m0r_storage_guard ON public.storage_objects AS RESTRICTIVE FOR ALL TO edrion_app,edrion_petros_document_worker
 USING(public.edrion_petros_owner(institution_id,owner_student_id,owner_independent_user_id)
  OR (institution_id::text=public.edrion_current_institution() AND public.edrion_current_student() IS NULL AND public.edrion_current_independent_user() IS NULL)
  OR EXISTS(SELECT 1 FROM public.class_materials cm WHERE cm.object_id=storage_objects.id AND public.edrion_petros_material_visible(cm.id,storage_objects.institution_id))
  OR (current_user='edrion_app' AND kind='petros_guidance_attachment' AND processing_status='ready'
   AND public.edrion_petros_guidance_file_visible(id,institution_id,derived->'guidanceBinding')))
 WITH CHECK(public.edrion_petros_owner(institution_id,owner_student_id,owner_independent_user_id)
  OR (institution_id::text=public.edrion_current_institution() AND public.edrion_current_student() IS NULL AND public.edrion_current_independent_user() IS NULL));
-- Worker grants are explicit, never ALL TABLES and never qualification writes.
GRANT SELECT ON public.students,public.knowledge_items,public.knowledge_item_pages,public.storage_objects,public.class_materials,public.courses,public.course_enrollments TO edrion_petros_document_worker;
GRANT SELECT(id,institution_id,status) ON public.institution_users TO edrion_petros_document_worker;
GRANT SELECT(item_id,ordinal,state,invalidated_at,admissible) ON public.knowledge_item_versions TO edrion_petros_document_worker;
DROP POLICY IF EXISTS m0r_worker_storage ON public.storage_objects;
CREATE POLICY m0r_worker_storage ON public.storage_objects FOR SELECT TO edrion_petros_document_worker
 USING(public.edrion_petros_owner(institution_id,owner_student_id,owner_independent_user_id)
 OR EXISTS(SELECT 1 FROM public.class_materials cm WHERE cm.object_id=storage_objects.id AND public.edrion_petros_material_visible(cm.id,storage_objects.institution_id)));

-- Source access rechecks current ownership, revocation, object availability,
-- material membership and the exact extracted page checksum on every operation.
CREATE OR REPLACE FUNCTION public.edrion_petros_document_live(i uuid, k_id uuid, m uuid, v integer, h text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.knowledge_items k
  WHERE k.institution_id=i AND k.source_revoked_at IS NULL AND k.status='ready' AND k.version=v
   AND NOT EXISTS(SELECT 1 FROM public.knowledge_item_versions kv WHERE kv.item_id=k.id AND kv.ordinal=k.version AND (kv.invalidated_at IS NOT NULL OR kv.state<>'complete' OR NOT kv.admissible))
   AND (k.id=k_id OR (m IS NOT NULL AND k.origin->>'classMaterialId'=m::text))
   AND (m IS NULL OR public.edrion_petros_material_visible(m,i))
   AND jsonb_array_length(k.object_ids)=1
   AND EXISTS(SELECT 1 FROM public.storage_objects o WHERE o.id::text=k.object_ids->>0 AND o.institution_id=i
    AND o.processing_status IN('uploaded','ready')
    AND (k.origin->'petrosExtraction'->>'fileSha256' IS NULL OR k.origin->'petrosExtraction'->>'fileSha256'=o.checksum_sha256)
    AND (m IS NULL OR EXISTS(SELECT 1 FROM public.class_materials cm WHERE cm.id=m AND cm.object_id=o.id)))
   AND (SELECT encode(sha256(convert_to(string_agg(p.page_index::text || ':' || p.text,E'\n' ORDER BY p.page_index),'UTF8')),'hex')
     FROM public.knowledge_item_pages p WHERE p.item_id=k.id)=h)
$$;
-- Replace permissive legacy document policies with explicit source/owner scopes.
DO $$ DECLARE t text; p record; predicate text; BEGIN
 FOREACH t IN ARRAY ARRAY['petros_document_source_revisions','petros_document_preparations','petros_document_lesson_artifacts','petros_document_learner_paths'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
  END LOOP;
  IF t='petros_document_source_revisions' THEN
   predicate:='public.edrion_petros_document_live(institution_id,canonical_knowledge_item_id,class_material_id,document_version,checksum)';
  ELSE
   predicate:='EXISTS(SELECT 1 FROM public.petros_document_source_revisions r WHERE r.id=source_revision_id AND r.institution_id=' || quote_ident(t) || '.institution_id)';
   IF t='petros_document_learner_paths' THEN
    predicate:=predicate || ' AND public.edrion_petros_owner(institution_id,student_id) AND EXISTS(SELECT 1 FROM public.knowledge_items k WHERE k.id=knowledge_item_id AND k.student_id=petros_document_learner_paths.student_id AND k.institution_id=petros_document_learner_paths.institution_id AND k.source_revoked_at IS NULL)';
   END IF;
  END IF;
  EXECUTE format('CREATE POLICY m0r_document_scope ON public.%I FOR ALL TO edrion_app,edrion_petros_document_worker USING(%s) WITH CHECK(%s)',t,predicate,predicate);
 END LOOP;
END $$;
-- The worker must resolve a live owner path and set its trusted preparation ID.
DROP POLICY IF EXISTS m0r_worker_preparation ON public.petros_document_preparations;
CREATE POLICY m0r_worker_preparation ON public.petros_document_preparations AS RESTRICTIVE FOR ALL TO edrion_petros_document_worker
 USING(id::text=NULLIF(current_setting('app.preparation_id',true),'') AND EXISTS(
  SELECT 1 FROM public.petros_document_learner_paths p WHERE p.preparation_id=petros_document_preparations.id AND p.status='active'))
 WITH CHECK(id::text=NULLIF(current_setting('app.preparation_id',true),'') AND EXISTS(
  SELECT 1 FROM public.petros_document_learner_paths p WHERE p.preparation_id=petros_document_preparations.id AND p.status='active'));
DROP POLICY IF EXISTS m0r_worker_artifact ON public.petros_document_lesson_artifacts;
CREATE POLICY m0r_worker_artifact ON public.petros_document_lesson_artifacts AS RESTRICTIVE FOR ALL TO edrion_petros_document_worker
 USING(preparation_id::text=NULLIF(current_setting('app.preparation_id',true),''))
 WITH CHECK(preparation_id::text=NULLIF(current_setting('app.preparation_id',true),''));

REVOKE ALL ON FUNCTION public.edrion_petros_owner(uuid,uuid,uuid),public.edrion_petros_material_visible(uuid,uuid),public.edrion_petros_document_live(uuid,uuid,uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edrion_petros_owner(uuid,uuid,uuid),public.edrion_petros_material_visible(uuid,uuid),public.edrion_petros_document_live(uuid,uuid,uuid,integer,text) TO edrion_app,edrion_petros_document_worker;
REVOKE ALL ON FUNCTION public.edrion_petros_guidance_file_visible(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edrion_petros_guidance_file_visible(uuid,uuid,jsonb) TO edrion_app,edrion_petros_document_worker;

-- Existing names are not evidence of equivalent indexes. Abort atomically on
-- a conflicting partial install; do not silently keep or replace its objects.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('petros_document_source_revisions','petros_document_source_revisions_uq','CREATE UNIQUE INDEX petros_document_source_revisions_uq ON public.petros_document_source_revisions USING btree (institution_id, source_key, document_version, checksum, parser_version)'),
  ('petros_document_source_revisions','petros_document_source_revisions_material_idx','CREATE INDEX petros_document_source_revisions_material_idx ON public.petros_document_source_revisions USING btree (institution_id, class_material_id, created_at)'),
  ('petros_document_preparations','petros_document_preparations_dedupe_uq','CREATE UNIQUE INDEX petros_document_preparations_dedupe_uq ON public.petros_document_preparations USING btree (institution_id, source_revision_id, requested_concept_id, generator_version, curriculum_key)'),
  ('petros_document_preparations','petros_document_preparations_status_idx','CREATE INDEX petros_document_preparations_status_idx ON public.petros_document_preparations USING btree (status, updated_at)'),
  ('petros_document_lesson_artifacts','petros_document_lesson_artifacts_concept_uq','CREATE UNIQUE INDEX petros_document_lesson_artifacts_concept_uq ON public.petros_document_lesson_artifacts USING btree (institution_id, source_revision_id, concept_id, generator_version)'),
  ('petros_document_lesson_artifacts','petros_document_lesson_artifacts_preparation_idx','CREATE INDEX petros_document_lesson_artifacts_preparation_idx ON public.petros_document_lesson_artifacts USING btree (preparation_id, status)'),
  ('petros_document_learner_paths','petros_document_learner_paths_uq','CREATE UNIQUE INDEX petros_document_learner_paths_uq ON public.petros_document_learner_paths USING btree (institution_id, student_id, source_revision_id)'),
  ('petros_document_learner_paths','petros_document_learner_paths_learner_idx','CREATE INDEX petros_document_learner_paths_learner_idx ON public.petros_document_learner_paths USING btree (institution_id, student_id, updated_at)')) AS expected(table_name,index_name,definition) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_indexes x WHERE x.schemaname='public' AND x.tablename=r.table_name
    AND x.indexname=r.index_name AND x.indexdef=r.definition) THEN
   RAISE EXCEPTION 'M0R_DOCUMENT_INDEX_DRIFT_REQUIRES_REVIEW';
  END IF;
 END LOOP;
END $$;

-- BEGIN PHASE B DEPLOYMENT OVERLAY (the guard above is rehearsal-only).
-- BEGIN PHASE B CONSTRAINT PREFLIGHT
-- Phase A creates the composite constraints as one group. A partial prior
-- install must abort, rather than letting its sentinel hide missing protection.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('petros_document_source_revisions','m0r_source_canonical_tenant_fk','knowledge_items',ARRAY['canonical_knowledge_item_id','institution_id'],ARRAY['id','institution_id'],false),
  ('petros_document_source_revisions','m0r_source_material_tenant_fk','class_materials',ARRAY['class_material_id','institution_id'],ARRAY['id','institution_id'],false),
  ('petros_document_learner_paths','m0r_path_student_tenant_fk','students',ARRAY['student_id','institution_id'],ARRAY['id','institution_id'],false),
  ('petros_document_learner_paths','m0r_path_knowledge_owner_fk','knowledge_items',ARRAY['knowledge_item_id','institution_id','student_id'],ARRAY['id','institution_id','student_id'],false),
  ('petros_document_preparations','m0r_preparation_revision_fk','petros_document_source_revisions',ARRAY['source_revision_id','institution_id'],ARRAY['id','institution_id'],false),
  ('petros_document_lesson_artifacts','m0r_artifact_preparation_fk','petros_document_preparations',ARRAY['preparation_id','institution_id','source_revision_id'],ARRAY['id','institution_id','source_revision_id'],false),
  ('petros_document_learner_paths','m0r_path_preparation_fk','petros_document_preparations',ARRAY['preparation_id','institution_id','source_revision_id'],ARRAY['id','institution_id','source_revision_id'],false),
  ('petros_document_preparations','m0r_first_lesson_source_fk','petros_document_lesson_artifacts',ARRAY['first_lesson_id','institution_id','source_revision_id','id'],ARRAY['id','institution_id','source_revision_id','preparation_id'],true)
 ) AS expected(child,name,parent,child_columns,parent_columns,deferred) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass('public.'||r.child)
    AND c.conname=r.name AND c.contype='f' AND c.confrelid=to_regclass('public.'||r.parent) AND c.convalidated
    AND c.confdeltype='a' AND c.confupdtype='a' AND c.condeferrable=r.deferred AND c.condeferred=r.deferred
    AND (SELECT array_agg(a.attname::text ORDER BY k.ordinality) FROM unnest(c.conkey) WITH ORDINALITY k(attnum,ordinality)
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum)=r.child_columns
    AND (SELECT array_agg(a.attname::text ORDER BY k.ordinality) FROM unnest(c.confkey) WITH ORDINALITY k(attnum,ordinality)
      JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum)=r.parent_columns) THEN
   RAISE EXCEPTION 'M0R_DOCUMENT_CONSTRAINT_DRIFT_REQUIRES_REVIEW';
  END IF;
 END LOOP;
END $$;
-- END PHASE B CONSTRAINT PREFLIGHT
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='edrion_petros_document_evaluator') THEN
  CREATE ROLE edrion_petros_document_evaluator NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
 END IF;
END $$;
ALTER ROLE edrion_petros_document_worker NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['edrion_petros_document_worker','edrion_petros_document_evaluator'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
    OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=r))
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND pg_has_role(r,c.relowner,'MEMBER')) THEN
   RAISE EXCEPTION 'M0R_DOCUMENT_ROLE_REQUIRES_RECONCILIATION';
  END IF;
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA public FROM edrion_petros_document_evaluator;
-- Dedicated identities cannot retain unrelated grants from an earlier install.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM edrion_petros_document_worker,edrion_petros_document_evaluator;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM edrion_petros_document_worker,edrion_petros_document_evaluator;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT USAGE ON SCHEMA public TO edrion_petros_document_evaluator;
GRANT EXECUTE ON FUNCTION public.edrion_petros_owner(uuid,uuid,uuid),public.edrion_petros_material_visible(uuid,uuid),public.edrion_petros_document_live(uuid,uuid,uuid,integer,text) TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT EXECUTE ON FUNCTION public.edrion_petros_guidance_file_visible(uuid,uuid,jsonb) TO edrion_petros_document_worker;
GRANT SELECT ON public.knowledge_items TO edrion_petros_document_worker;
GRANT SELECT(id,institution_id,student_id,independent_user_id,status,source_revoked_at,version,origin,object_ids) ON public.knowledge_items TO edrion_petros_document_evaluator;
GRANT SELECT(id,institution_id,institution_user_id,status,class_id) ON public.students TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT SELECT(item_id,page_index,text) ON public.knowledge_item_pages TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT SELECT(id,institution_id,owner_student_id,owner_independent_user_id,processing_status,checksum_sha256) ON public.storage_objects TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT SELECT(id,institution_id,context_type,context_id,subject_id,object_id,version) ON public.class_materials TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT SELECT(id,institution_id,status) ON public.courses TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT SELECT(id,institution_id,student_id,course_id) ON public.course_enrollments TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT SELECT(id,institution_id,status,disabled_at,password_reset_required_at) ON public.institution_users TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT SELECT(id,institution_user_id,role_key) ON public.institution_user_roles TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT SELECT(item_id,ordinal,state,invalidated_at,admissible,fingerprint) ON public.knowledge_item_versions TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT SELECT ON public.petros_document_source_revisions,public.petros_document_preparations,public.petros_document_learner_paths TO edrion_petros_document_worker;
GRANT SELECT,INSERT ON public.petros_document_lesson_artifacts TO edrion_petros_document_worker;
GRANT UPDATE(status,stage,progress,message,document_map,recommended_concept_id,first_lesson_id,issue_code,issue_detail,retryable,attempt_count,token_usage,timing,lease_owner,lease_expires_at,started_at,completed_at,updated_at) ON public.petros_document_preparations TO edrion_petros_document_worker;
GRANT SELECT(id,institution_id,student_id,status,version,learner_context,source_context) ON public.petros_learning_sessions TO edrion_petros_document_evaluator;
GRANT SELECT ON public.petros_document_source_revisions,public.petros_document_learner_paths TO edrion_petros_document_evaluator;
GRANT SELECT(id,institution_id,status,source_revision_id,private_plan) ON public.petros_document_lesson_artifacts TO edrion_petros_document_evaluator;

GRANT SELECT(id) ON public.knowledge_item_versions TO edrion_petros_document_worker,edrion_petros_document_evaluator;
GRANT SELECT ON public.knowledge_item_version_pages TO edrion_petros_document_worker,edrion_petros_document_evaluator;

-- Authority metadata must also fail closed on dedicated pools without job scope.
-- The ordinary login's existing identity/role lookup remains available for auth.
DO $$ DECLARE t text; predicate text; BEGIN
 FOREACH t IN ARRAY ARRAY['students','institution_users','storage_objects','class_materials','courses','course_enrollments'] LOOP
  predicate:='institution_id::text=public.edrion_current_institution() AND public.edrion_current_student() IS NOT NULL';
  IF t='students' THEN predicate:=predicate||' AND id::text=public.edrion_current_student()'; END IF;
  IF t='course_enrollments' THEN predicate:=predicate||' AND student_id::text=public.edrion_current_student()'; END IF;
  IF t='institution_users' THEN predicate:=predicate||' AND EXISTS(SELECT 1 FROM public.students st WHERE st.institution_user_id=institution_users.id)'; END IF;
  EXECUTE format('DROP POLICY IF EXISTS m0r_document_authority_guard ON public.%I',t);
  EXECUTE format('CREATE POLICY m0r_document_authority_guard ON public.%I AS RESTRICTIVE FOR ALL TO edrion_petros_document_worker,edrion_petros_document_evaluator USING (%s) WITH CHECK (false)',t,predicate);
 END LOOP;
END $$;
ALTER TABLE public.institution_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institution_user_roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS m0r_application_roles ON public.institution_user_roles;
CREATE POLICY m0r_application_roles ON public.institution_user_roles FOR ALL TO edrion_app USING(true) WITH CHECK(true);
DROP POLICY IF EXISTS m0r_document_roles ON public.institution_user_roles;
CREATE POLICY m0r_document_roles ON public.institution_user_roles FOR ALL TO edrion_petros_document_worker,edrion_petros_document_evaluator
 USING(EXISTS(SELECT 1 FROM public.students st WHERE st.institution_user_id=institution_user_roles.institution_user_id)) WITH CHECK(false);

-- Pre-session intents and content-free failure receipts have nullable session
-- links. Their owner must still be current; non-null links must match that owner.
DO $$ DECLARE r record; predicate text; BEGIN
 FOR r IN SELECT c.table_name FROM information_schema.columns c
  WHERE c.table_schema='public' AND c.column_name='session_id' AND c.is_nullable='YES'
    AND c.table_name LIKE 'petros_%'
    AND EXISTS(SELECT 1 FROM information_schema.columns x WHERE x.table_schema='public' AND x.table_name=c.table_name AND x.column_name='student_id')
    AND EXISTS(SELECT 1 FROM pg_constraint f JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attname='session_id' AND a.attnum=ANY(f.conkey)
      WHERE f.conrelid=to_regclass('public.'||c.table_name) AND f.confrelid='public.petros_learning_sessions'::regclass AND f.contype='f')
 LOOP
  predicate:=format('public.edrion_petros_owner(institution_id,student_id) AND (session_id IS NULL OR EXISTS(SELECT 1 FROM public.petros_learning_sessions s WHERE s.id=%I.session_id AND s.institution_id=%I.institution_id AND s.student_id=%I.student_id))',r.table_name,r.table_name,r.table_name);
  EXECUTE format('DROP POLICY IF EXISTS m0r_owner_allow ON public.%I',r.table_name);
  EXECUTE format('DROP POLICY IF EXISTS m0r_owner_guard ON public.%I',r.table_name);
  EXECUTE format('CREATE POLICY m0r_owner_allow ON public.%I FOR ALL TO edrion_app,edrion_petros_document_worker USING (%s) WITH CHECK (%s)',r.table_name,predicate,predicate);
  EXECUTE format('CREATE POLICY m0r_owner_guard ON public.%I AS RESTRICTIVE FOR ALL TO edrion_app,edrion_petros_document_worker USING (%s) WITH CHECK (%s)',r.table_name,predicate,predicate);
 END LOOP;
END $$;

-- Shared extraction may be stored before enrollment exists, but only for the
-- exact authorized material backed by the initiating staff user's live object.
CREATE OR REPLACE FUNCTION public.edrion_petros_staff_material(i uuid,m uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(current_user='edrion_app' AND i::text=public.edrion_current_institution()
  AND public.edrion_current_student() IS NULL AND public.edrion_current_independent_user() IS NULL
  AND m::text=NULLIF(current_setting('app.source_item_id',true),'')
  AND EXISTS(SELECT 1 FROM public.class_materials cm JOIN public.storage_objects o ON o.id=cm.object_id AND o.institution_id=i
    JOIN public.institution_users u ON u.id=o.owner_staff_user_id AND u.institution_id=i AND u.status='active'
    JOIN public.staff st ON st.institution_user_id=u.id AND st.institution_id=i AND st.status='active'
    WHERE cm.id=m AND cm.institution_id=i AND cm.context_id::text=NULLIF(current_setting('app.course_id',true),'')
      AND u.id::text=NULLIF(current_setting('app.institution_user_id',true),'') AND o.processing_status='ready'),false)
$$;
REVOKE ALL ON FUNCTION public.edrion_petros_staff_material(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edrion_petros_staff_material(uuid,uuid) TO edrion_app,edrion_petros_document_worker,edrion_petros_document_evaluator;

-- Current readers use complete immutable extraction pages, with legacy fallback
-- only when no published extraction exists at the current ordinal.
CREATE OR REPLACE FUNCTION public.edrion_petros_document_live(i uuid, k_id uuid, m uuid, v integer, h text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT (k_id IS NULL AND current_user='edrion_app' AND public.edrion_petros_staff_material(i,m)
   AND EXISTS(SELECT 1 FROM public.class_materials cm WHERE cm.id=m AND cm.version=v))
  OR EXISTS(SELECT 1 FROM public.knowledge_items k
  WHERE k.institution_id=i AND k.source_revoked_at IS NULL AND k.status='ready' AND (k.version=v OR (m IS NOT NULL AND k.origin->>'materialVersion'=v::text))
   AND NOT EXISTS(SELECT 1 FROM public.knowledge_item_versions kv WHERE kv.item_id=k.id AND kv.ordinal=k.version AND (kv.invalidated_at IS NOT NULL OR kv.state<>'complete' OR NOT kv.admissible))
   AND (k.id=k_id OR (m IS NOT NULL AND k.origin->>'classMaterialId'=m::text))
   AND (m IS NULL OR public.edrion_petros_material_visible(m,i))
   AND jsonb_array_length(k.object_ids)=1
   AND EXISTS(SELECT 1 FROM public.storage_objects o WHERE o.id::text=k.object_ids->>0 AND o.institution_id=i
    AND o.processing_status IN('uploaded','ready')
    AND (k.origin->'petrosExtraction'->>'fileSha256' IS NULL OR k.origin->'petrosExtraction'->>'fileSha256'=o.checksum_sha256)
    AND (m IS NULL OR EXISTS(SELECT 1 FROM public.class_materials cm WHERE cm.id=m AND cm.object_id=o.id
      AND (k.origin->>'materialVersion' IS NULL OR k.origin->>'materialVersion'=cm.version::text))))
   AND CASE WHEN EXISTS(SELECT 1 FROM public.knowledge_item_versions kv WHERE kv.item_id=k.id AND kv.ordinal=k.version)
    THEN (SELECT encode(sha256(convert_to(string_agg(p.page_index::text || ':' || p.text,E'\n' ORDER BY p.page_index),'UTF8')),'hex')
      FROM public.knowledge_item_version_pages p JOIN public.knowledge_item_versions kv ON kv.id=p.version_id
      WHERE kv.item_id=k.id AND kv.ordinal=k.version AND kv.state='complete' AND kv.invalidated_at IS NULL AND kv.admissible)
    ELSE (SELECT encode(sha256(convert_to(string_agg(p.page_index::text || ':' || p.text,E'\n' ORDER BY p.page_index),'UTF8')),'hex')
      FROM public.knowledge_item_pages p WHERE p.item_id=k.id) END=h)
$$;

-- Staff access is read-only and tied to the exact course and item selected after
-- the service re-resolves current permissions/course/campus authority. Compiler
-- reads retain staff scope; recipient review additionally verifies enrollment.
CREATE OR REPLACE FUNCTION public.edrion_petros_staff_source(i uuid,k uuid,m uuid,s uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(current_user='edrion_app' AND i::text=public.edrion_current_institution()
  AND public.edrion_current_student() IS NULL AND public.edrion_current_independent_user() IS NULL
  AND k::text=NULLIF(current_setting('app.source_item_id',true),'')
  AND EXISTS(SELECT 1 FROM public.class_materials cm JOIN public.courses c ON c.id=cm.context_id
    JOIN public.course_enrollments e ON e.course_id=c.id AND e.student_id=s AND e.institution_id=i
    WHERE cm.id=m AND cm.institution_id=i AND cm.context_type='course' AND c.institution_id=i AND c.status='active'
      AND c.id::text=NULLIF(current_setting('app.course_id',true),'') AND cm.subject_id=c.subject_id)
  AND EXISTS(SELECT 1 FROM public.institution_users iu JOIN public.staff st ON st.institution_user_id=iu.id AND st.institution_id=i
    WHERE iu.id::text=NULLIF(current_setting('app.institution_user_id',true),'') AND iu.institution_id=i
      AND iu.status='active' AND st.status='active'),false)
$$;
REVOKE ALL ON FUNCTION public.edrion_petros_staff_source(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edrion_petros_staff_source(uuid,uuid,uuid,uuid) TO edrion_app;
DROP POLICY IF EXISTS m0r_owner_guard ON public.knowledge_items;
CREATE POLICY m0r_owner_guard ON public.knowledge_items AS RESTRICTIVE FOR ALL TO edrion_app
 USING(public.edrion_petros_owner(institution_id,student_id,independent_user_id)
  OR (source_revoked_at IS NULL AND public.edrion_petros_staff_source(institution_id,id,CASE WHEN origin->>'classMaterialId' ~ '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' THEN (origin->>'classMaterialId')::uuid ELSE NULL END,student_id)))
 WITH CHECK(public.edrion_petros_owner(institution_id,student_id,independent_user_id));
DROP POLICY IF EXISTS m0r_worker_knowledge_guard ON public.knowledge_items;
CREATE POLICY m0r_worker_knowledge_guard ON public.knowledge_items AS RESTRICTIVE FOR ALL TO edrion_petros_document_worker
 USING(public.edrion_petros_owner(institution_id,student_id,independent_user_id))
 WITH CHECK(public.edrion_petros_owner(institution_id,student_id,independent_user_id));
DROP POLICY IF EXISTS m0r_staff_source_allow ON public.knowledge_items;
CREATE POLICY m0r_staff_source_allow ON public.knowledge_items FOR SELECT TO edrion_app
 USING(source_revoked_at IS NULL AND public.edrion_petros_staff_source(institution_id,id,CASE WHEN origin->>'classMaterialId' ~ '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' THEN (origin->>'classMaterialId')::uuid ELSE NULL END,student_id));
-- PostgreSQL also applies UPDATE USING policies to SELECT FOR SHARE. Permit
-- locking the selected staff source; the restrictive WITH CHECK remains owner-only.
DROP POLICY IF EXISTS m0r_staff_source_lock ON public.knowledge_items;
CREATE POLICY m0r_staff_source_lock ON public.knowledge_items FOR UPDATE TO edrion_app
 USING(source_revoked_at IS NULL AND public.edrion_petros_staff_source(institution_id,id,CASE WHEN origin->>'classMaterialId' ~ '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' THEN (origin->>'classMaterialId')::uuid ELSE NULL END,student_id))
 WITH CHECK(false);

-- Evaluator is read-only, owner-scoped and limited to the exact active session
-- and its released lesson. The session predicate avoids an artifact/session RLS cycle.
DROP POLICY IF EXISTS m0r_evaluator_knowledge ON public.knowledge_items;
CREATE POLICY m0r_evaluator_knowledge ON public.knowledge_items FOR SELECT TO edrion_petros_document_evaluator
 USING(public.edrion_petros_owner(institution_id,student_id,independent_user_id));
DROP POLICY IF EXISTS m0r_evaluator_pages ON public.knowledge_item_pages;
CREATE POLICY m0r_evaluator_pages ON public.knowledge_item_pages FOR SELECT TO edrion_petros_document_evaluator
 USING(EXISTS(SELECT 1 FROM public.knowledge_items k WHERE k.id=item_id));
DROP POLICY IF EXISTS m0r_evaluator_storage ON public.storage_objects;
CREATE POLICY m0r_evaluator_storage ON public.storage_objects FOR SELECT TO edrion_petros_document_evaluator
 USING(public.edrion_petros_owner(institution_id,owner_student_id,owner_independent_user_id)
  OR EXISTS(SELECT 1 FROM public.class_materials cm WHERE cm.object_id=storage_objects.id AND public.edrion_petros_material_visible(cm.id,storage_objects.institution_id)));
DROP POLICY IF EXISTS m0r_evaluator_session ON public.petros_learning_sessions;
CREATE POLICY m0r_evaluator_session ON public.petros_learning_sessions FOR SELECT TO edrion_petros_document_evaluator
 USING(id::text=NULLIF(current_setting('app.session_id',true),'') AND status='active'
  AND public.edrion_petros_owner(institution_id,student_id)
  AND EXISTS(SELECT 1 FROM public.students st JOIN public.institution_users iu ON iu.id=st.institution_user_id
    JOIN public.institution_user_roles ur ON ur.institution_user_id=iu.id AND ur.role_key='student'
    WHERE st.id=petros_learning_sessions.student_id AND st.institution_id=petros_learning_sessions.institution_id
      AND iu.institution_id=st.institution_id AND iu.status='active' AND iu.disabled_at IS NULL
      AND iu.password_reset_required_at IS NULL)
  AND EXISTS(SELECT 1 FROM public.knowledge_items k WHERE k.id::text=source_context->>'referenceId'
    AND k.institution_id=petros_learning_sessions.institution_id AND k.source_revoked_at IS NULL AND k.status='ready'
    AND (k.origin->>'classMaterialId' IS NULL OR public.edrion_petros_material_visible((k.origin->>'classMaterialId')::uuid,k.institution_id))
    AND EXISTS(SELECT 1 FROM public.knowledge_item_versions v WHERE v.item_id=k.id AND v.ordinal=k.version
      AND v.fingerprint=source_context->>'sourceFingerprint' AND v.invalidated_at IS NULL AND v.state='complete' AND v.admissible)
    AND jsonb_array_length(k.object_ids)=1
    AND EXISTS(SELECT 1 FROM public.storage_objects o WHERE o.id::text=k.object_ids->>0 AND o.institution_id=k.institution_id
      AND o.processing_status IN('uploaded','ready')
      AND (k.origin->'petrosExtraction'->>'fileSha256' IS NULL OR k.origin->'petrosExtraction'->>'fileSha256'=o.checksum_sha256)
      AND (k.origin->>'classMaterialId' IS NULL OR EXISTS(SELECT 1 FROM public.class_materials cm
        WHERE cm.id::text=k.origin->>'classMaterialId' AND cm.object_id=o.id
          AND (k.origin->>'materialVersion' IS NULL OR k.origin->>'materialVersion'=cm.version::text))))));
DROP POLICY IF EXISTS m0r_evaluator_revision ON public.petros_document_source_revisions;
CREATE POLICY m0r_evaluator_revision ON public.petros_document_source_revisions FOR SELECT TO edrion_petros_document_evaluator
 USING(public.edrion_petros_document_live(institution_id,canonical_knowledge_item_id,class_material_id,document_version,checksum));
DROP POLICY IF EXISTS m0r_evaluator_path ON public.petros_document_learner_paths;
CREATE POLICY m0r_evaluator_path ON public.petros_document_learner_paths FOR SELECT TO edrion_petros_document_evaluator
 USING(status='active' AND public.edrion_petros_owner(institution_id,student_id)
  AND EXISTS(SELECT 1 FROM public.petros_document_source_revisions r WHERE r.id=source_revision_id));
DROP POLICY IF EXISTS m0r_evaluator_artifact ON public.petros_document_lesson_artifacts;
CREATE POLICY m0r_evaluator_artifact ON public.petros_document_lesson_artifacts FOR SELECT TO edrion_petros_document_evaluator
 USING(id::text=NULLIF(current_setting('app.lesson_id',true),'') AND status='published'
  AND EXISTS(SELECT 1 FROM public.petros_learning_sessions s JOIN public.petros_document_learner_paths p ON p.source_revision_id=petros_document_lesson_artifacts.source_revision_id
    WHERE s.learner_context->>'documentLessonId'=petros_document_lesson_artifacts.id::text AND p.knowledge_item_id::text=s.source_context->>'referenceId')
  AND EXISTS(SELECT 1 FROM public.petros_document_learner_paths p WHERE p.source_revision_id=petros_document_lesson_artifacts.source_revision_id AND p.status='active'));

-- One path can prepare multiple concepts. All work is still constrained to one
-- live revision; a job cannot choose an unrelated or cancelled owner's source.
DROP POLICY IF EXISTS m0r_worker_preparation ON public.petros_document_preparations;
CREATE POLICY m0r_worker_preparation ON public.petros_document_preparations AS RESTRICTIVE FOR ALL TO edrion_petros_document_worker
 USING(id::text=NULLIF(current_setting('app.preparation_id',true),'') AND EXISTS(
  SELECT 1 FROM public.petros_document_learner_paths p WHERE p.source_revision_id=petros_document_preparations.source_revision_id AND p.status='active'))
 WITH CHECK(EXISTS(SELECT 1 FROM public.petros_document_learner_paths p WHERE p.source_revision_id=petros_document_preparations.source_revision_id AND p.status='active'));
GRANT INSERT(institution_id,source_revision_id,requested_concept_id,generator_version,request_context,status,stage,progress,message)
 ON public.petros_document_preparations TO edrion_petros_document_worker;

-- PostgreSQL requires an UPDATE privilege for SELECT FOR SHARE. Grant only the
-- identity column for locking and reject every actual worker UPDATE by trigger.
-- No SECURITY DEFINER/owner bypass is introduced to acquire authority locks.
CREATE OR REPLACE FUNCTION public.edrion_petros_worker_lock_only()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$ BEGIN
 IF current_user='edrion_petros_document_worker' THEN RAISE EXCEPTION 'PETROS_WORKER_SOURCE_MUTATION_DENIED'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['knowledge_items','knowledge_item_versions','storage_objects','students','institution_users','institution_user_roles','class_materials','courses','course_enrollments','petros_document_learner_paths'] LOOP
  EXECUTE format('GRANT UPDATE(id) ON public.%I TO edrion_petros_document_worker',t);
  EXECUTE format('DROP TRIGGER IF EXISTS m0r_worker_lock_only ON public.%I',t);
  EXECUTE format('CREATE TRIGGER m0r_worker_lock_only BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.edrion_petros_worker_lock_only()',t);
 END LOOP;
END $$;

REVOKE UPDATE ON public.petros_document_lesson_artifacts FROM edrion_petros_document_worker;

-- Current teacher goals expose only participation metadata through an explicitly
-- selected assignment, after the service checks class/subject/campus authority.
CREATE OR REPLACE FUNCTION public.edrion_petros_staff_assignment(i uuid,s uuid,c jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(current_user='edrion_app' AND i::text=public.edrion_current_institution()
  AND public.edrion_current_student() IS NULL AND public.edrion_current_independent_user() IS NULL
  AND c->'assignmentContext'->>'assignmentId'=NULLIF(current_setting('app.assignment_id',true),'')
  AND EXISTS(SELECT 1 FROM public.assignments a JOIN public.assignment_assignees aa ON aa.assignment_id=a.id AND aa.student_id=s
    JOIN public.class_subject_teachers ct ON ct.class_id=a.class_id AND ct.subject_id=a.subject_id AND ct.institution_id=i
    JOIN public.staff st ON st.id=ct.teacher_id AND st.institution_id=i AND st.status='active'
    JOIN public.institution_users u ON u.id=st.institution_user_id AND u.institution_id=i AND u.status='active'
    WHERE a.id::text=NULLIF(current_setting('app.assignment_id',true),'') AND a.institution_id=i AND a.petros_guidance IS NOT NULL
      AND u.id::text=NULLIF(current_setting('app.institution_user_id',true),'')),false)
$$;
REVOKE ALL ON FUNCTION public.edrion_petros_staff_assignment(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edrion_petros_staff_assignment(uuid,uuid,jsonb) TO edrion_app;
DROP POLICY IF EXISTS m0r_owner_guard ON public.petros_learning_sessions;
CREATE POLICY m0r_owner_guard ON public.petros_learning_sessions AS RESTRICTIVE FOR ALL TO edrion_app
 USING(public.edrion_petros_owner(institution_id,student_id) OR public.edrion_petros_staff_assignment(institution_id,student_id,source_context))
 WITH CHECK(public.edrion_petros_owner(institution_id,student_id));
DROP POLICY IF EXISTS m0r_worker_session_guard ON public.petros_learning_sessions;
CREATE POLICY m0r_worker_session_guard ON public.petros_learning_sessions AS RESTRICTIVE FOR ALL TO edrion_petros_document_worker
 USING(public.edrion_petros_owner(institution_id,student_id)) WITH CHECK(public.edrion_petros_owner(institution_id,student_id));
DROP POLICY IF EXISTS m0r_staff_participation ON public.petros_learning_sessions;
CREATE POLICY m0r_staff_participation ON public.petros_learning_sessions FOR SELECT TO edrion_app
 USING(public.edrion_petros_staff_assignment(institution_id,student_id,source_context));

-- Administrative policy events have no learner owner. They remain private to
-- their current authenticated staff actor and keep existing append-only grants.
CREATE OR REPLACE FUNCTION public.edrion_petros_current_staff(i uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(current_user='edrion_app' AND i::text=public.edrion_current_institution()
  AND public.edrion_current_student() IS NULL AND public.edrion_current_independent_user() IS NULL
  AND EXISTS(SELECT 1 FROM public.institution_users u WHERE u.institution_id=i AND u.status='active'
    AND u.id::text=NULLIF(current_setting('app.institution_user_id',true),'')),false)
$$;
REVOKE ALL ON FUNCTION public.edrion_petros_current_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edrion_petros_current_staff(uuid) TO edrion_app;
DROP POLICY IF EXISTS m0r_owner_guard ON public.petros_institutional_events;
CREATE POLICY m0r_owner_guard ON public.petros_institutional_events AS RESTRICTIVE FOR ALL TO edrion_app
 USING(public.edrion_petros_owner(institution_id,student_id) OR (student_id IS NULL AND actor_kind IN('institution_user','teacher')
  AND actor_id::text=NULLIF(current_setting('app.institution_user_id',true),'') AND public.edrion_petros_current_staff(institution_id)))
 WITH CHECK(public.edrion_petros_owner(institution_id,student_id) OR (student_id IS NULL AND actor_kind IN('institution_user','teacher')
  AND actor_id::text=NULLIF(current_setting('app.institution_user_id',true),'') AND public.edrion_petros_current_staff(institution_id)));
DROP POLICY IF EXISTS m0r_staff_policy_event ON public.petros_institutional_events;
CREATE POLICY m0r_staff_policy_event ON public.petros_institutional_events FOR ALL TO edrion_app
 USING(student_id IS NULL AND actor_kind IN('institution_user','teacher') AND actor_id::text=NULLIF(current_setting('app.institution_user_id',true),'') AND public.edrion_petros_current_staff(institution_id))
 WITH CHECK(student_id IS NULL AND actor_kind IN('institution_user','teacher') AND actor_id::text=NULLIF(current_setting('app.institution_user_id',true),'') AND public.edrion_petros_current_staff(institution_id));
DROP POLICY IF EXISTS m0r_worker_event_guard ON public.petros_institutional_events;
CREATE POLICY m0r_worker_event_guard ON public.petros_institutional_events AS RESTRICTIVE FOR ALL TO edrion_petros_document_worker
 USING(public.edrion_petros_owner(institution_id,student_id)) WITH CHECK(public.edrion_petros_owner(institution_id,student_id));
REVOKE UPDATE,DELETE,TRUNCATE ON public.petros_institutional_events FROM edrion_app,edrion_petros_document_worker;
DROP TRIGGER IF EXISTS m0r_history_immutable ON public.petros_institutional_events;
CREATE TRIGGER m0r_history_immutable BEFORE UPDATE OR DELETE ON public.petros_institutional_events FOR EACH ROW EXECUTE FUNCTION public.edrion_block_mutation();
DROP TRIGGER IF EXISTS m0r_history_no_truncate ON public.petros_institutional_events;
CREATE TRIGGER m0r_history_no_truncate BEFORE TRUNCATE ON public.petros_institutional_events FOR EACH STATEMENT EXECUTE FUNCTION public.edrion_block_mutation();

-- Staff bootstrap reads only the specifically requested explicit-sharing record.
-- Services then verify current course/enrollment authority before recipient scope.
DO $$ DECLARE t text; owner_predicate text; selected text; BEGIN
 FOREACH t IN ARRAY ARRAY['petros_qualitative_events','petros_qualitative_submissions','petros_qualitative_reviews'] LOOP
  owner_predicate:='public.edrion_petros_owner(institution_id,student_id)';
  IF t='petros_qualitative_submissions' THEN
   owner_predicate:=owner_predicate||' AND EXISTS(SELECT 1 FROM public.petros_learning_sessions s WHERE s.id=petros_qualitative_submissions.session_id AND s.institution_id=petros_qualitative_submissions.institution_id AND s.student_id=petros_qualitative_submissions.student_id)';
  END IF;
  selected:='id::text=NULLIF(current_setting(''app.review_request_id'',true),'''') AND public.edrion_petros_current_staff(institution_id)';
  EXECUTE format('DROP POLICY IF EXISTS m0r_owner_guard ON public.%I',t);
  EXECUTE format('CREATE POLICY m0r_owner_guard ON public.%I AS RESTRICTIVE FOR ALL TO edrion_app USING ((%s) OR (%s)) WITH CHECK (%s)',t,owner_predicate,selected,owner_predicate);
  EXECUTE format('DROP POLICY IF EXISTS m0r_staff_shared_review ON public.%I',t);
  EXECUTE format('CREATE POLICY m0r_staff_shared_review ON public.%I FOR SELECT TO edrion_app USING (%s)',t,selected);
  EXECUTE format('DROP POLICY IF EXISTS m0r_worker_review_guard ON public.%I',t);
  EXECUTE format('CREATE POLICY m0r_worker_review_guard ON public.%I AS RESTRICTIVE FOR ALL TO edrion_petros_document_worker USING (%s) WITH CHECK (%s)',t,owner_predicate,owner_predicate);
 END LOOP;
END $$;

-- PLAN content is immutable, but the existing V1 runtime completes its bounded
-- planned -> rendered -> completed lifecycle. Only those receipt fields can change.
CREATE OR REPLACE FUNCTION public.edrion_petros_plan_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Petros planning history cannot be erased'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','resulting_block_id','render_request_id','route_reference','observed_outcome','updated_at'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','resulting_block_id','render_request_id','route_reference','observed_outcome','updated_at']) THEN
  RAISE EXCEPTION 'Petros planning content is immutable';
 END IF;
 IF NOT ((OLD.status IN('planned','overridden') AND NEW.status='rendered') OR (OLD.status='rendered' AND NEW.status='completed')
   OR (OLD.status='rendered' AND NEW.status='rendered' AND OLD.resulting_block_id IS NULL AND NEW.resulting_block_id IS NOT NULL
    AND (to_jsonb(NEW)-ARRAY['resulting_block_id','updated_at'])=(to_jsonb(OLD)-ARRAY['resulting_block_id','updated_at']))
   OR (to_jsonb(NEW)-'updated_at')=(to_jsonb(OLD)-'updated_at'))
   OR (OLD.resulting_block_id IS NOT NULL AND NEW.resulting_block_id IS DISTINCT FROM OLD.resulting_block_id)
   OR (OLD.render_request_id IS NOT NULL AND NEW.render_request_id IS DISTINCT FROM OLD.render_request_id)
   OR (OLD.status='rendered' AND NEW.route_reference IS DISTINCT FROM OLD.route_reference) THEN
  RAISE EXCEPTION 'Petros planning lifecycle transition denied';
 END IF;
 IF NEW.resulting_block_id IS DISTINCT FROM OLD.resulting_block_id AND NEW.resulting_block_id IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.petros_teaching_blocks b WHERE b.id=NEW.resulting_block_id
    AND b.decision_id=NEW.id AND b.session_id=NEW.session_id AND b.institution_id=NEW.institution_id AND b.student_id=NEW.student_id) THEN
  RAISE EXCEPTION 'Petros planning block ownership denied';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.edrion_petros_plan_lifecycle() FROM PUBLIC;
GRANT UPDATE(status,resulting_block_id,render_request_id,route_reference,observed_outcome,updated_at) ON public.petros_planning_decisions TO edrion_app;
DROP TRIGGER IF EXISTS m0r_history_immutable ON public.petros_planning_decisions;
CREATE TRIGGER m0r_history_immutable BEFORE UPDATE OR DELETE ON public.petros_planning_decisions FOR EACH ROW EXECUTE FUNCTION public.edrion_petros_plan_lifecycle();
