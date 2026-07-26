CREATE TABLE IF NOT EXISTS compliance_evidence_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  kind text NOT NULL,
  storage_key text NOT NULL,
  collected_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'
);
