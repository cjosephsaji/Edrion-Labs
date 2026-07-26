-- Campus Bundle A phase 1: gates, library holds, transport broadcasts, digital ID, outpass columns.

CREATE TABLE IF NOT EXISTS student_request_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES student_requests(id) ON DELETE CASCADE,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  config jsonb NOT NULL DEFAULT '{}',
  cleared_at timestamptz,
  cleared_by uuid,
  rejected_at timestamptz,
  rejected_reason text,
  waived_at timestamptz,
  waived_by uuid,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_request_gates_kind_ck CHECK (kind IN ('guardian_approval', 'payment')),
  CONSTRAINT student_request_gates_status_ck CHECK (status IN ('pending', 'cleared', 'rejected', 'waived'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS student_request_gates_pending_idx
  ON student_request_gates (institution_id, status)
  WHERE status = 'pending';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS student_request_gates_request_kind_uq
  ON student_request_gates (request_id, kind);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS library_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  fulfilled_loan_id uuid REFERENCES library_loans(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT library_holds_status_ck CHECK (status IN ('active', 'fulfilled', 'expired', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS library_holds_student_active_idx
  ON library_holds (student_id, status)
  WHERE status = 'active';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS library_fine_invoice_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  loan_id uuid NOT NULL REFERENCES library_loans(id) ON DELETE CASCADE,
  fee_invoice_item_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT library_fine_invoice_links_idempotency_uq UNIQUE (institution_id, idempotency_key)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS transport_trip_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES campuses(id) ON DELETE SET NULL,
  route_id uuid,
  vehicle_id uuid,
  message text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS transport_trip_broadcasts_route_idx
  ON transport_trip_broadcasts (institution_id, route_id, sent_at DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS identity_token_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  key_version integer NOT NULL,
  public_key_pem text NOT NULL,
  active_from timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS identity_token_keys_inst_version_uq
  ON identity_token_keys (institution_id, key_version);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS student_id_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES campuses(id) ON DELETE SET NULL,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  document_render_id uuid REFERENCES document_renders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  token_version integer NOT NULL DEFAULT 1,
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_id_cards_status_ck CHECK (status IN ('active', 'revoked', 'superseded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS student_id_cards_student_active_uq
  ON student_id_cards (student_id)
  WHERE status = 'active';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS identity_scan_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  scan_nonce text NOT NULL,
  result text NOT NULL,
  context_kind text NOT NULL,
  device_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_scan_audit_nonce_uq UNIQUE (institution_id, scan_nonce)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS hostel_mess_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  menu_date date NOT NULL,
  meal_slot text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hostel_mess_menus_slot_ck CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS hostel_mess_menus_day_slot_uq
  ON hostel_mess_menus (institution_id, campus_id, menu_date, meal_slot);
--> statement-breakpoint

ALTER TABLE gate_passes
  ADD COLUMN IF NOT EXISTS holder_student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES student_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expected_return_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid,
  ADD COLUMN IF NOT EXISTS revoke_reason text,
  ADD COLUMN IF NOT EXISTS direction text DEFAULT 'outgoing';
--> statement-breakpoint

ALTER TABLE campus_access_logs
  ADD COLUMN IF NOT EXISTS pass_id uuid REFERENCES gate_passes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS scan_result text,
  ADD COLUMN IF NOT EXISTS deny_reason text,
  ADD COLUMN IF NOT EXISTS context_kind text;
--> statement-breakpoint

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS reported_by_student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_confirmation_status text,
  ADD COLUMN IF NOT EXISTS student_visible_stage text;
--> statement-breakpoint
