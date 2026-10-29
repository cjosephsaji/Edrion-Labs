-- PROPOSAL ONLY. Unregistered; independent security/install review required.
-- Rehearse only in a newly initialized disposable cluster after M1/M2.
-- No tables, roles, grants or RLS changes. Existing invoker checks retained.
CREATE OR REPLACE FUNCTION edrion_petros_m1_unit_provenance() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE r public.petros_document_source_revisions; l jsonb; native_ref jsonb; BEGIN
 SELECT * INTO r FROM public.petros_document_source_revisions WHERE id=NEW.source_revision_id AND institution_id=NEW.institution_id AND format_version='v2';
 IF NOT FOUND OR NEW.manifest->>'sourceId'<>r.original_source_id::text OR NEW.manifest->>'sourceHash'<>r.checksum
  OR NEW.manifest->>'representationHash'<>r.v2_revision->>'representationHash' OR NEW.manifest->'processing'<>r.v2_revision->'processing'
  OR (NEW.manifest->>'parentId') IS DISTINCT FROM NEW.parent_id::text THEN RAISE EXCEPTION 'M1_SOURCE_PIN_MISMATCH' USING ERRCODE='23514'; END IF;
 l:=NEW.manifest->'locator';
 IF (l->>'kind'='pdf' AND (r.v2_revision->'source'->>'kind'<>'pdf' OR (l->>'page')::integer NOT BETWEEN 1 AND (r.v2_revision->>'pageCount')::integer))
 OR (l->>'kind'='slide' AND (r.v2_revision->'source'->>'kind'<>'pptx' OR (l->>'slide')::integer NOT BETWEEN 1 AND (r.v2_revision->>'slideCount')::integer))
 OR (l->>'kind'='synthetic' AND r.v2_revision->'source'->>'kind'<>'synthetic')
 OR l->>'kind' NOT IN('pdf','slide','synthetic','converted_slide','docx','txt','markdown') THEN RAISE EXCEPTION 'M1_INVALID_LOCATOR' USING ERRCODE='23514'; END IF;
 IF l->>'kind'='converted_slide' AND (r.v2_revision->'source'->>'kind'<>'legacy_ppt' OR l->>'convertedHash'<>r.v2_revision->'conversion'->>'convertedHash'
  OR NOT (r.v2_revision->'conversion'->'slideMap' @> jsonb_build_array(jsonb_build_object('originalSlide',(l->>'originalSlide')::integer,'convertedPage',(l->>'convertedPage')::integer))))
 THEN RAISE EXCEPTION 'M1_INVALID_CONVERSION_LINEAGE' USING ERRCODE='23514'; END IF;
 IF l->>'kind' IN ('docx','txt','markdown') THEN
  IF l->>'kind' IS DISTINCT FROM r.v2_revision->'source'->>'kind'
    OR l->>'version' IS DISTINCT FROM 'petros.native-locator.v1'
    OR l->>'sourceHash' IS DISTINCT FROM r.checksum
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.v2_revision->'nativeLocators') AS pins(pin) WHERE pin=l)
  THEN RAISE EXCEPTION 'M2FA_INVALID_NATIVE_LOCATOR' USING ERRCODE='23514'; END IF;
  FOR native_ref IN
    SELECT value FROM jsonb_path_query(NEW.manifest,'$.native.runs[*].locator') AS q(value)
    UNION ALL SELECT value FROM jsonb_path_query(NEW.manifest,'$.native.cells[*].locator') AS q(value)
    UNION ALL SELECT value FROM jsonb_path_query(NEW.manifest,'$.native.inline[*].locator') AS q(value)
    UNION ALL SELECT value FROM jsonb_path_query(NEW.manifest,'$.native.links[*].locator') AS q(value)
    UNION ALL SELECT value FROM jsonb_path_query(NEW.manifest,'$.native.fence.lines[*]') AS q(value)
  LOOP
    IF native_ref->>'kind' IS DISTINCT FROM l->>'kind'
      OR native_ref->>'sourceHash' IS DISTINCT FROM r.checksum
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.v2_revision->'nativeLocators') AS pins(pin) WHERE pin=native_ref)
    THEN RAISE EXCEPTION 'M2FA_INVALID_NATIVE_ANCHOR' USING ERRCODE='23514'; END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;

-- Extend only the bounded existing receipt stage discriminator.
ALTER TABLE knowledge_preparations DROP CONSTRAINT m2_preparation_progress_bound;
ALTER TABLE knowledge_preparations ADD CONSTRAINT m2_preparation_progress_bound CHECK (
  m2_progress IS NULL OR (operation_version='v2' AND jsonb_typeof(m2_progress)='object'
    AND octet_length(m2_progress::text)<=4096 AND m2_progress->>'stage' IS NOT NULL
    AND m2_progress->>'stage' IN ('validating_source','scanning','extracting','rendering','selecting_visual_regions',
      'interpreting_visual_regions','interpreting_semantics','validating_provenance','persisting','completed',
      'partially_supported','cancelled','blocked','format_detection','structural_validation','content_unit_construction','semantic_eligibility')));
