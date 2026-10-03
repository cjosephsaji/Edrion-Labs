-- The dispatcher has a deliberately narrow cross-tenant capability. Its definer must
-- bypass RLS; an ordinary table owner is insufficient with FORCE ROW LEVEL SECURITY.
-- Fail the migration explicitly instead of installing a dispatcher that silently sees no work.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Knowledge preparation migration requires a privileged DATABASE_MIGRATION_URL role with BYPASSRLS';
  END IF;
END $$;

CREATE TABLE knowledge_preparations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  material_id uuid NOT NULL, -- Content-free admission receipt survives material deletion.
  material_version integer NOT NULL CHECK (material_version > 0),
  object_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  scope jsonb NOT NULL,
  extractor_version text NOT NULL,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','succeeded','failed','cancelled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  total_attempts integer NOT NULL DEFAULT 0 CHECK (total_attempts BETWEEN 0 AND 6),
  fence integer NOT NULL DEFAULT 0 CHECK (fence >= 0),
  lease_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  next_dispatch_at timestamptz NOT NULL DEFAULT now(),
  dispatch_sequence integer NOT NULL DEFAULT 0,
  pages_done integer NOT NULL DEFAULT 0 CHECK (pages_done BETWEEN 0 AND 500),
  error_code text,
  retryable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state = 'running') = (lease_until IS NOT NULL)),
  CHECK (error_code IS NULL OR length(error_code) <= 80)
);
CREATE UNIQUE INDEX knowledge_preparations_publication_uq ON knowledge_preparations(material_id, material_version, object_id, extractor_version);
CREATE INDEX knowledge_preparations_due_idx ON knowledge_preparations(state, next_dispatch_at);
CREATE INDEX knowledge_preparations_institution_idx ON knowledge_preparations(institution_id, created_at);
ALTER TABLE knowledge_preparations ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_preparations FORCE ROW LEVEL SECURITY;
CREATE POLICY knowledge_preparation_tenant ON knowledge_preparations FOR ALL
  USING (institution_id::text = edrion_current_institution() AND edrion_current_student() IS NULL)
  WITH CHECK (institution_id::text = edrion_current_institution() AND edrion_current_student() IS NULL AND
    EXISTS (SELECT 1 FROM class_materials m WHERE m.id = material_id AND m.institution_id = knowledge_preparations.institution_id));
GRANT SELECT, INSERT, UPDATE ON knowledge_preparations TO edrion_app;
CREATE FUNCTION edrion_immutable_preparation_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.institution_id, NEW.material_id, NEW.material_version, NEW.object_id,
    NEW.requested_by, NEW.scope, NEW.extractor_version, NEW.created_at)
    IS DISTINCT FROM ROW(OLD.institution_id, OLD.material_id, OLD.material_version, OLD.object_id,
    OLD.requested_by, OLD.scope, OLD.extractor_version, OLD.created_at)
    OR NEW.fence < OLD.fence OR NEW.total_attempts < OLD.total_attempts THEN
    RAISE EXCEPTION 'Preparation identity and attempt history are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_preparation_identity BEFORE UPDATE ON knowledge_preparations
  FOR EACH ROW EXECUTE FUNCTION edrion_immutable_preparation_identity();

-- Minimal cross-tenant dispatcher capability. Returns IDs only, never content or credentials.
-- Business reads/claims/publication still run through scoped RLS and current permission checks.
CREATE FUNCTION edrion_due_knowledge_preparations() RETURNS TABLE(id uuid, institution_id uuid, dispatch_sequence integer)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public SET row_security = off AS $$
  WITH due AS (
    SELECT p.id FROM public.knowledge_preparations p
    WHERE p.state IN ('queued', 'running') AND p.next_dispatch_at <= now()
      AND p.next_attempt_at <= now() AND (p.lease_until IS NULL OR p.lease_until <= now())
    ORDER BY p.next_dispatch_at, p.id LIMIT 20 FOR UPDATE SKIP LOCKED
  )
  UPDATE public.knowledge_preparations p
    SET next_dispatch_at = now() + interval '10 seconds', dispatch_sequence = p.dispatch_sequence + 1
    FROM due WHERE p.id = due.id RETURNING p.id, p.institution_id, p.dispatch_sequence;
$$;
REVOKE ALL ON FUNCTION edrion_due_knowledge_preparations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION edrion_due_knowledge_preparations() TO edrion_app;

-- Stop pending work and preserve its bounded-attempt receipt. Deleting a material cannot
-- reset the rolling admission count or permit an already-running worker to commit.
CREATE FUNCTION edrion_cancel_material_preparations() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE knowledge_preparations SET state = 'cancelled', lease_until = NULL,
    fence = fence + 1, version = version + 1, retryable = false,
    error_code = 'PETROS_SOURCE_DELETED', updated_at = now()
    WHERE material_id = OLD.id AND state IN ('queued', 'running');
  RETURN OLD;
END $$;
CREATE TRIGGER cancel_material_preparations BEFORE DELETE ON class_materials
  FOR EACH ROW EXECUTE FUNCTION edrion_cancel_material_preparations();
