ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz;
