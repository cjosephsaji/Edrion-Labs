ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS event_version text DEFAULT '2',
  ADD COLUMN IF NOT EXISTS envelope jsonb;
