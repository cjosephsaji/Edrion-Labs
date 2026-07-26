CREATE INDEX IF NOT EXISTS event_registrations_event_status_idx
  ON event_registrations (event_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS campus_events_institution_starts_idx
  ON campus_events (institution_id, starts_at DESC);
