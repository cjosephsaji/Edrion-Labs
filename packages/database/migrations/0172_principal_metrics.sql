CREATE TABLE IF NOT EXISTS principal_metric_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  as_of date NOT NULL,
  value jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT principal_metric_rollups_uq UNIQUE (institution_id, metric_key, as_of)
);
