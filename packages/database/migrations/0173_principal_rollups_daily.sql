-- Principal dashboard read path: institution + date ordering for rollups.

CREATE INDEX IF NOT EXISTS principal_metric_rollups_inst_as_of_idx
  ON principal_metric_rollups (institution_id, as_of DESC);
