-- Additive history. Existing pages, intents, outlines and sessions are not rewritten.
ALTER TABLE knowledge_items ADD COLUMN source_revoked_at timestamptz;
CREATE TABLE knowledge_item_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  ordinal integer NOT NULL CHECK (ordinal > 0),
  object_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  page_count integer NOT NULL CHECK (page_count BETWEEN 1 AND 500),
  admissible boolean NOT NULL,
  state text NOT NULL DEFAULT 'building' CHECK (state IN ('building', 'complete')),
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((invalidated_at IS NULL) = (invalidation_reason IS NULL))
);
CREATE UNIQUE INDEX knowledge_item_versions_fingerprint_uq ON knowledge_item_versions(item_id, fingerprint);
CREATE INDEX knowledge_item_versions_item_idx ON knowledge_item_versions(item_id, created_at);
CREATE TABLE knowledge_item_version_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES knowledge_item_versions(id) ON DELETE CASCADE,
  page_index integer NOT NULL CHECK (page_index BETWEEN 0 AND 499),
  text text NOT NULL CHECK (octet_length(text) <= 8000000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX knowledge_item_version_pages_page_uq ON knowledge_item_version_pages(version_id, page_index);

-- Content can only be written while building, in the same transaction as completion.
CREATE FUNCTION edrion_guard_extraction_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM knowledge_items WHERE id = OLD.item_id) THEN
      RAISE EXCEPTION 'Invalidate an extraction version; delete only with its knowledge owner';
    END IF;
    RETURN OLD;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['state','invalidated_at','invalidation_reason'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state','invalidated_at','invalidation_reason'])
     OR (OLD.state = 'complete' AND NEW.state <> 'complete')
     OR (OLD.invalidated_at IS NOT NULL AND
       (NEW.invalidated_at IS DISTINCT FROM OLD.invalidated_at OR NEW.invalidation_reason IS DISTINCT FROM OLD.invalidation_reason)) THEN
    RAISE EXCEPTION 'Extraction content and invalidation are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER knowledge_version_immutable BEFORE UPDATE OR DELETE ON knowledge_item_versions
  FOR EACH ROW EXECUTE FUNCTION edrion_guard_extraction_version();

CREATE FUNCTION edrion_guard_extraction_page() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_state text;
BEGIN
  SELECT state INTO version_state FROM knowledge_item_versions
    WHERE id = CASE WHEN TG_OP = 'INSERT' THEN NEW.version_id ELSE OLD.version_id END;
  IF TG_OP = 'DELETE' AND version_state IS NULL THEN RETURN OLD; END IF;
  IF TG_OP <> 'INSERT' OR version_state IS DISTINCT FROM 'building' THEN
    RAISE EXCEPTION 'Extraction pages are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER knowledge_version_page_immutable BEFORE INSERT OR UPDATE OR DELETE ON knowledge_item_version_pages
  FOR EACH ROW EXECUTE FUNCTION edrion_guard_extraction_page();

-- Commit cannot expose a building version, incomplete/gapped pages or excessive text.
CREATE FUNCTION edrion_check_extraction_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v knowledge_item_versions; n integer; lo integer; hi integer; units bigint;
BEGIN
  SELECT * INTO v FROM knowledge_item_versions WHERE id = NEW.id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*), min(page_index), max(page_index),
    sum(2 * length(text) - length(regexp_replace(text, U&'[\+010000-\+10FFFF]', '', 'g')))
    INTO n, lo, hi, units FROM knowledge_item_version_pages WHERE version_id = v.id;
  IF v.state <> 'complete' OR n <> v.page_count OR lo <> 0 OR hi <> v.page_count - 1 OR units > 2000000 THEN
    RAISE EXCEPTION 'Extraction publication must contain a complete bounded page set';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER knowledge_version_complete AFTER INSERT OR UPDATE ON knowledge_item_versions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION edrion_check_extraction_complete();

ALTER TABLE knowledge_item_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_item_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY knowledge_version_owner ON knowledge_item_versions FOR ALL USING (
  EXISTS (SELECT 1 FROM knowledge_items k WHERE k.id = item_id AND
    k.institution_id::text = edrion_current_institution() AND
    (edrion_current_student() IS NULL OR k.student_id::text = edrion_current_student()))
) WITH CHECK (
  EXISTS (SELECT 1 FROM knowledge_items k WHERE k.id = item_id AND
    k.institution_id::text = edrion_current_institution() AND
    (edrion_current_student() IS NULL OR k.student_id::text = edrion_current_student()))
);
ALTER TABLE knowledge_item_version_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_item_version_pages FORCE ROW LEVEL SECURITY;
CREATE POLICY knowledge_version_page_owner ON knowledge_item_version_pages FOR ALL
  USING (EXISTS (SELECT 1 FROM knowledge_item_versions v WHERE v.id = version_id))
  WITH CHECK (EXISTS (SELECT 1 FROM knowledge_item_versions v WHERE v.id = version_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge_item_versions, knowledge_item_version_pages TO edrion_app;


-- Deleting an owner records only identity, preventing retry/replay resurrection.
-- No FKs: these receipts must survive deletion of the source, student or institution.
CREATE TABLE knowledge_item_tombstones (
  item_id uuid PRIMARY KEY,
  institution_id uuid NOT NULL,
  student_id uuid NOT NULL,
  material_id text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_item_tombstones_owner_material_idx ON knowledge_item_tombstones(institution_id, student_id, material_id);
ALTER TABLE knowledge_item_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_item_tombstones FORCE ROW LEVEL SECURITY;
CREATE POLICY knowledge_tombstone_owner ON knowledge_item_tombstones FOR ALL
  USING (institution_id::text = edrion_current_institution() AND (edrion_current_student() IS NULL OR student_id::text = edrion_current_student()))
  WITH CHECK (institution_id::text = edrion_current_institution() AND (edrion_current_student() IS NULL OR student_id::text = edrion_current_student()));
GRANT SELECT, INSERT ON knowledge_item_tombstones TO edrion_app;
CREATE FUNCTION edrion_record_knowledge_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.institution_id IS NOT NULL AND OLD.student_id IS NOT NULL AND OLD.origin->>'classMaterialId' IS NOT NULL THEN
    INSERT INTO knowledge_item_tombstones(item_id, institution_id, student_id, material_id)
      VALUES (OLD.id, OLD.institution_id, OLD.student_id, OLD.origin->>'classMaterialId') ON CONFLICT DO NOTHING;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER knowledge_item_deletion_receipt BEFORE DELETE ON knowledge_items
  FOR EACH ROW EXECUTE FUNCTION edrion_record_knowledge_deletion();
