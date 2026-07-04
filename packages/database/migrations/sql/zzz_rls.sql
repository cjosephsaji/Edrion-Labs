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
      ('subjects', 'institution_id'),
      ('classes', 'institution_id'),
      ('class_subject_teachers', 'institution_id'),
      -- Institution-portal people directory (Phase 4): tenant-isolated under the API guard.
      ('students', 'institution_id'),
      ('teachers', 'institution_id'),
      ('staff', 'institution_id'),
      ('parents', 'institution_id'),
      ('student_guardians', 'institution_id'),
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
      ('profile_change_requests', 'institution_id')
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
