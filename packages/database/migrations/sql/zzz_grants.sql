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
-- Phase 2 history stays append-only when baseline grants are reapplied.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['petros_teaching_pack_candidates', 'petros_teaching_pack_reviews',
    'petros_teaching_pack_review_revocations', 'petros_objective_evidence_commands',
    'petros_objective_evidence_events', 'petros_qualitative_submissions', 'petros_qualitative_reviews', 'petros_qualitative_events',
    'petros_visual_operations', 'petros_adaptive_bindings',
    'petros_workspace_checkpoints', 'petros_workspace_operations',
    'petros_workspace_prediction_challenges', 'petros_workspace_prediction_responses',
    'petros_learning_artifact_receipts', 'petros_learning_review_receipts',
    'petros_assignment_learning_releases', 'petros_assignment_learning_targets',
    'petros_assignment_learning_recipients', 'petros_assignment_learning_receipts'] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM edrion_app', t);
    END IF;
  END LOOP;
  IF to_regclass('petros_reviewer_qualifications') IS NOT NULL THEN
    REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON petros_reviewer_qualifications FROM edrion_app;
  END IF;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['integration_provider_mappings', 'course_curriculum_records', 'course_curriculum_revisions'] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM edrion_app', t);
    END IF;
  END LOOP;
END $$;
-- Roster jobs remain status-updatable, but their history must not be erasable.
DO $$ BEGIN
  IF to_regclass('knowledge_preparations') IS NOT NULL THEN
    REVOKE DELETE, TRUNCATE ON knowledge_preparations FROM edrion_app;
  END IF;
  IF to_regclass('roster_sync_jobs') IS NOT NULL THEN
    REVOKE DELETE, TRUNCATE ON roster_sync_jobs FROM edrion_app;
  END IF;
END $$;
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
REVOKE UPDATE, DELETE, TRUNCATE ON learner_model_events FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON learn_session_events FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON flashcard_reviews FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON streak_events FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON achievement_awards FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON student_request_events FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON grading_scheme_versions, mark_revisions FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON feed_events FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON learner_model_events FROM edrion_app;

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
                           'learning_events', 'learn_ai_calls', 'flashcard_reviews', 'achievement_awards',
                           'student_request_events', 'feed_events', 'learner_model_events'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_append_only ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_append_only BEFORE UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION edrion_block_mutation()',
      t, t
    );
  END LOOP;
END
$$;

DO $$ BEGIN
 IF to_regclass('petros_workspaces') IS NOT NULL THEN
  GRANT SELECT,INSERT,UPDATE ON petros_workspaces TO edrion_app;
  REVOKE DELETE,TRUNCATE ON petros_workspaces FROM edrion_app;
  GRANT SELECT,INSERT ON petros_workspace_checkpoints,petros_workspace_operations TO edrion_app;
  REVOKE UPDATE,DELETE,TRUNCATE ON petros_workspace_checkpoints,petros_workspace_operations FROM edrion_app;
 END IF;
END $$;

-- Prediction observations stay append-only after generic grant replay.
DO $$ BEGIN
 IF to_regclass('petros_workspace_prediction_challenges') IS NOT NULL THEN
  GRANT SELECT,INSERT ON petros_workspace_prediction_challenges,petros_workspace_prediction_responses TO edrion_app;
  REVOKE UPDATE,DELETE,TRUNCATE ON petros_workspace_prediction_challenges,petros_workspace_prediction_responses FROM edrion_app;
 END IF;
END $$;

DO $$ BEGIN
 IF to_regclass('public.petros_journeys') IS NOT NULL THEN
 REVOKE DELETE,TRUNCATE ON petros_journeys,petros_memory_records FROM edrion_app;
 REVOKE UPDATE,DELETE,TRUNCATE ON petros_journey_sessions,petros_continuity_receipts FROM edrion_app;
 END IF;
END $$;

-- Phase4 owner history grants survive broad grant replay.
DO $$ BEGIN IF to_regclass('public.petros_material_corrections') IS NOT NULL THEN
 REVOKE DELETE,TRUNCATE ON petros_material_corrections,petros_institutional_interventions FROM edrion_app;
 END IF; END $$;

-- Phase5 engineering indexes and synthetic instrumentation remain immutable after grant replay.
DO $$ BEGIN IF to_regclass('public.petros_release_bundles') IS NOT NULL THEN
 GRANT SELECT,INSERT ON petros_release_evaluations,petros_release_bundles,petros_release_disables,petros_pilot_events TO edrion_app;
 REVOKE UPDATE,DELETE,TRUNCATE ON petros_release_evaluations,petros_release_bundles,petros_release_disables,petros_pilot_events FROM edrion_app;
 END IF; END $$;

-- Replay narrow Phase5 runtime/operations projections without PUBLIC execution.
DO $$ BEGIN
 IF to_regprocedure('edrion_petros_operations()') IS NOT NULL THEN
  REVOKE ALL ON FUNCTION edrion_petros_operations() FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION edrion_petros_operations() TO edrion_app;
 END IF;
 IF to_regprocedure('edrion_petros_runtime_release(uuid,uuid)') IS NOT NULL THEN
  REVOKE ALL ON FUNCTION edrion_petros_runtime_release(uuid,uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION edrion_petros_runtime_release(uuid,uuid) TO edrion_app;
 END IF;
END $$;
