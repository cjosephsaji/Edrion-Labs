-- Campus Bundle B: placements core.

CREATE TABLE IF NOT EXISTS placement_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES campuses(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  opens_at timestamptz,
  closes_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT placement_seasons_status_ck CHECK (status IN ('draft', 'open', 'closed', 'archived'))
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS placement_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  sector text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS placement_drives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  season_id uuid NOT NULL REFERENCES placement_seasons(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES placement_companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  package_band text,
  eligibility jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'scheduled',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS placement_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  drive_id uuid NOT NULL REFERENCES placement_drives(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  resume_id uuid,
  submitted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT placement_applications_status_ck CHECK (
    status IN ('draft', 'submitted', 'shortlisted', 'rejected', 'offered', 'withdrawn')
  ),
  CONSTRAINT placement_applications_drive_student_uq UNIQUE (drive_id, student_id)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS placement_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  application_id uuid NOT NULL UNIQUE REFERENCES placement_applications(id) ON DELETE CASCADE,
  offer_text text,
  document_vault_id uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
