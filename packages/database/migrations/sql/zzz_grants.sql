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
REVOKE UPDATE, DELETE, TRUNCATE ON security_events FROM edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON activity_events FROM edrion_app;
-- Webhook deliveries: each attempt is an immutable record (insert/select only).
REVOKE UPDATE, DELETE, TRUNCATE ON webhook_deliveries FROM edrion_app;

-- Belt-and-braces: a trigger that hard-blocks UPDATE/DELETE regardless of role.
CREATE OR REPLACE FUNCTION edrion_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only; % is not permitted', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_events', 'security_events', 'activity_events', 'webhook_deliveries'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_append_only ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_append_only BEFORE UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION edrion_block_mutation()',
      t, t
    );
  END LOOP;
END
$$;
