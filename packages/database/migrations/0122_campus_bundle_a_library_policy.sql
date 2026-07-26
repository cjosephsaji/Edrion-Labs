-- Campus Bundle A: library renewal policy defaults (institution config extension point).

CREATE TABLE IF NOT EXISTS library_renewal_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES campuses(id) ON DELETE CASCADE,
  max_renewals integer NOT NULL DEFAULT 2,
  renewal_days integer NOT NULL DEFAULT 7,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS library_renewal_policies_scope_uq
  ON library_renewal_policies (institution_id, COALESCE(campus_id::text, 'all'));
