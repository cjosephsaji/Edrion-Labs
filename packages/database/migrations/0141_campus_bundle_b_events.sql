-- Clubs and campus events.

CREATE TABLE IF NOT EXISTS clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES campuses(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS club_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  joined_at timestamptz,
  CONSTRAINT club_memberships_club_student_uq UNIQUE (club_id, student_id)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS campus_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES campuses(id) ON DELETE SET NULL,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  capacity integer,
  is_paid boolean NOT NULL DEFAULT false,
  fee_minor integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  event_id uuid NOT NULL REFERENCES campus_events(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'registered',
  seat_no integer,
  checked_in_at timestamptz,
  fee_invoice_item_id uuid,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_registrations_event_student_uq UNIQUE (event_id, student_id)
);
