-- ─────────────────────────────────────────────────────────────────────────────
-- Append-only enforcement + least-privilege grants.
-- Applied AFTER Drizzle migrations by src/migrate.ts. Idempotent + tolerant of a
-- missing app role (dev may run everything as one superuser).
--
-- The application connects as `edrion_app`. On the append-only tables it gets
-- INSERT + SELECT only — never UPDATE or DELETE. This makes audit/security records
-- immutable from the normal application even if a service is compromised.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edrion_app') THEN
    -- NOLOGIN role used only to carry grants in single-superuser dev setups.
    CREATE ROLE edrion_app NOLOGIN;
  END IF;
END
$$;

-- Baseline: app role may read/write normal tables.
GRANT USAGE ON SCHEMA public TO edrion_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO edrion_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO edrion_app;

-- Append-only tables: revoke mutation, keep insert + read.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON fee_invoice_items, fee_gateway_events FROM edrion_app;
REVOKE DELETE, TRUNCATE ON fee_receipts, fee_structure_versions, fee_receipt_sequences, fee_waivers, institution_fee_config, fee_payments FROM edrion_app;
REVOKE UPDATE ON fee_receipts FROM edrion_app;
GRANT UPDATE (status, cancelled_reason, pdf_storage_ref, vault_document_id, refund_status, refund_amount_minor, refund_reason, refund_proposed_by, refund_second_approved_by, version) ON fee_receipts TO edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON security_events FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON activity_events FROM edrion_app;
-- Webhook deliveries: each attempt is an immutable record (insert/select only).
REVOKE UPDATE, DELETE, TRUNCATE ON webhook_deliveries FROM edrion_app;
-- Parent-portal immutable feeds: emergency broadcasts, gate exit events, digest deliveries.
REVOKE UPDATE, DELETE, TRUNCATE ON parent_emergency_broadcasts FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON gate_exit_events FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON parent_digest_deliveries FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON learning_events FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON learn_ai_calls FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON flashcard_reviews FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON streak_events FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON achievement_awards FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON student_request_events FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON grading_scheme_versions, mark_revisions FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON feed_events FROM edrion_app;
-- Timetable exceptions: append-only except revocation fields (enforced in 0089 migration + trigger).
REVOKE DELETE ON period_exceptions FROM edrion_app;
REVOKE UPDATE ON period_exceptions FROM edrion_app;
GRANT UPDATE (revoked_at, revoked_by, revoked_reason, recurring_until, version, updated_at)
  ON period_exceptions TO edrion_app;
GRANT SELECT, INSERT, UPDATE ON attendance_policies, attendance_rollups, request_marks_pending TO edrion_app;

-- Belt-and-braces: a trigger that hard-blocks UPDATE/DELETE regardless of role.
CREATE OR REPLACE FUNCTION edrion_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only; % is not permitted', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_events', 'security_events', 'activity_events', 'webhook_deliveries',
                           'parent_emergency_broadcasts', 'gate_exit_events', 'parent_digest_deliveries',
                           'learning_events', 'learn_ai_calls', 'flashcard_reviews', 'streak_events', 'achievement_awards',
                           'student_request_events', 'grading_scheme_versions', 'mark_revisions', 'feed_events'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_append_only ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_append_only BEFORE UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION edrion_block_mutation()',
      t, t
    );
  END LOOP;
END
$$;
