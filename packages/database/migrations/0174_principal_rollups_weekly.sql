-- Weekly principal metrics reuse daily rollup rows (no separate table); index metric lookups.

CREATE INDEX IF NOT EXISTS principal_metric_rollups_metric_key_idx
  ON principal_metric_rollups (institution_id, metric_key, as_of DESC);
