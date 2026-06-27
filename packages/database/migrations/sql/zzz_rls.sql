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
      ('webhook_endpoints', 'institution_id')
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
