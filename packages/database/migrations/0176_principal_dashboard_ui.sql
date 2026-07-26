-- Principal home UI reads rollups only — document generation idempotency index is in 0179.

COMMENT ON TABLE principal_metric_rollups IS 'Pre-aggregated principal dashboard metrics (WS6); no request-time scans.';
