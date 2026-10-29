-- PROPOSAL ONLY. M2 validation uses newly allocated disposable clusters.
-- Requires separate target approval after the unresolved M0-R/M1 staging gate.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';
ALTER TABLE knowledge_preparations ADD COLUMN m2_progress jsonb;
ALTER TABLE knowledge_preparations ADD CONSTRAINT m2_preparation_progress_bound CHECK (
  m2_progress IS NULL OR (operation_version='v2' AND jsonb_typeof(m2_progress)='object'
    AND octet_length(m2_progress::text)<=4096
    AND m2_progress->>'stage' IS NOT NULL
    AND m2_progress->>'stage' IN ('validating_source','scanning','extracting','rendering','selecting_visual_regions',
      'interpreting_visual_regions','interpreting_semantics','validating_provenance','persisting','completed','partially_supported','cancelled','blocked')));
