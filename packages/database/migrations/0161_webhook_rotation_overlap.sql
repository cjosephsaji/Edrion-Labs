ALTER TABLE webhook_endpoints
  ADD COLUMN IF NOT EXISTS previous_secret text,
  ADD COLUMN IF NOT EXISTS previous_secret_expires_at timestamptz;
