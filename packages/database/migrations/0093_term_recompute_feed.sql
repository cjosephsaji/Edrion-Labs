-- Term recompute approval queue + extended Today feed event types.

CREATE TABLE IF NOT EXISTS term_recompute_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  scheme_id uuid NOT NULL REFERENCES grading_schemes(id) ON DELETE RESTRICT,
  scheme_version integer NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'approved', 'rejected', 'completed')),
  proposed_by uuid,
  approved_by uuid,
  rejected_note text,
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS term_recompute_requests_institution_status_idx
  ON term_recompute_requests (institution_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS term_recompute_requests_pending_term_uniq
  ON term_recompute_requests (term_id)
  WHERE status = 'pending_approval';

ALTER TABLE feed_events DROP CONSTRAINT IF EXISTS feed_events_type_check;
ALTER TABLE feed_events ADD CONSTRAINT feed_events_type_check
  CHECK (type IN (
    'announcement',
    'marks_released',
    'mark_revised',
    'results_complete',
    'request_update',
    'club_event',
    'nudge'
  ));
