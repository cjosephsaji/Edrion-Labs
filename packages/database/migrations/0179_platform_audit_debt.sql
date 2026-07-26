-- Tier 3 audit debt: document generation job idempotency index.

CREATE INDEX IF NOT EXISTS document_renders_generation_key_idx
  ON document_renders (generation_key)
  WHERE generation_key IS NOT NULL;
