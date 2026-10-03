-- V10 repair: tenant-isolate federation connection secrets and retain roster preview history.
ALTER TABLE institution_identity_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_identity_providers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS institution_identity_provider_staff ON institution_identity_providers;
CREATE POLICY institution_identity_provider_staff ON institution_identity_providers FOR ALL
  USING (
    institution_id::text = edrion_current_institution()
    AND edrion_current_student() IS NULL
    AND edrion_current_independent_user() IS NULL
  )
  WITH CHECK (
    institution_id::text = edrion_current_institution()
    AND edrion_current_student() IS NULL
    AND edrion_current_independent_user() IS NULL
  );
--> statement-breakpoint
CREATE OR REPLACE FUNCTION petros_roster_compatibility_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Roster synchronization history is append-only';
  END IF;
  IF NEW.compatibility IS DISTINCT FROM OLD.compatibility OR
    (OLD.compatibility IS NOT NULL AND (
      NEW.institution_id IS DISTINCT FROM OLD.institution_id OR
      NEW.provider IS DISTINCT FROM OLD.provider
    )) THEN
    RAISE EXCEPTION 'Roster compatibility previews are immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS roster_compatibility_immutable ON roster_sync_jobs;
CREATE TRIGGER roster_compatibility_immutable BEFORE UPDATE OR DELETE ON roster_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION petros_roster_compatibility_immutable();
DROP TRIGGER IF EXISTS roster_history_no_truncate ON roster_sync_jobs;
CREATE TRIGGER roster_history_no_truncate BEFORE TRUNCATE ON roster_sync_jobs
  FOR EACH STATEMENT EXECUTE FUNCTION petros_roster_compatibility_immutable();
REVOKE DELETE, TRUNCATE ON roster_sync_jobs FROM edrion_app;
