-- Fees Phase 1. All amounts remain PostgreSQL integer minor units (~₹2.1 crore/value ceiling).

ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 1;
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS late_fee_policy jsonb;
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS category text;
UPDATE fee_structures SET status='archived' WHERE status='inactive';
ALTER TABLE fee_structures DROP CONSTRAINT IF EXISTS fee_structures_status_check;
ALTER TABLE fee_structures ADD CONSTRAINT fee_structures_status_check CHECK (status IN ('draft','active','archived'));
ALTER TABLE fee_structures ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE fee_invoices ADD COLUMN IF NOT EXISTS structure_version_no integer;
ALTER TABLE fee_invoices ADD COLUMN IF NOT EXISTS installment_seq integer;
ALTER TABLE fee_invoices ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'structure';
ALTER TABLE fee_invoices ADD COLUMN IF NOT EXISTS linked_request_id uuid;
ALTER TABLE fee_invoices ADD COLUMN IF NOT EXISTS generation_batch_id uuid;
UPDATE fee_invoices SET origin = CASE WHEN fee_structure_id IS NULL THEN 'manual' ELSE 'structure' END;
ALTER TABLE fee_invoices DROP CONSTRAINT IF EXISTS fee_invoices_origin_check;
ALTER TABLE fee_invoices ADD CONSTRAINT fee_invoices_origin_check CHECK (origin IN ('structure','request','manual'));
ALTER TABLE fee_invoices ADD CONSTRAINT fee_invoices_linked_request_fk FOREIGN KEY (linked_request_id) REFERENCES student_requests(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fee_invoices_structure_generation_unique
  ON fee_invoices (fee_structure_id, structure_version_no, student_id, installment_seq)
  WHERE origin = 'structure' AND fee_structure_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS fee_structure_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  structure_id uuid NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE, version_no integer NOT NULL,
  line_items jsonb NOT NULL, installment_schedule jsonb NOT NULL, late_fee_policy jsonb,
  created_by uuid REFERENCES institution_users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fee_structure_versions_unique UNIQUE (structure_id, version_no)
);

INSERT INTO fee_structure_versions (institution_id, structure_id, version_no, line_items, installment_schedule, late_fee_policy, created_at)
SELECT institution_id, id, 1,
  jsonb_build_array(jsonb_build_object('key','legacy','label',fee_type,'amount_minor',amount,'tax_pct',0,'category',
    CASE WHEN fee_type IN ('tuition','exam','lab','transport','hostel') THEN fee_type ELSE 'other' END)),
  jsonb_build_array(jsonb_build_object('seq',1,'label','Full payment','due_date',NULL,'pct_bps',10000)),
  late_fee_policy, now()
FROM fee_structures
ON CONFLICT (structure_id, version_no) DO NOTHING;

CREATE TABLE IF NOT EXISTS fee_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES fee_invoices(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('charge','waiver','late_fee','adjustment')),
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('tuition','exam','lab','transport','hostel','other')),
  label text NOT NULL, amount_minor integer NOT NULL, tax_minor integer NOT NULL DEFAULT 0,
  source jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fee_invoice_items_invoice_idx ON fee_invoice_items(invoice_id);
INSERT INTO fee_invoice_items (institution_id, invoice_id, student_id, kind, category, label, amount_minor, source)
SELECT i.institution_id, i.id, i.student_id, 'charge',
  CASE WHEN i.source IN ('tuition','transport','hostel') THEN i.source ELSE 'other' END,
  COALESCE(s.fee_type, initcap(i.source)), i.amount, jsonb_build_object('migration','0087')
FROM fee_invoices i LEFT JOIN fee_structures s ON s.id = i.fee_structure_id
WHERE i.status <> 'cancelled' AND NOT EXISTS (SELECT 1 FROM fee_invoice_items x WHERE x.invoice_id = i.id);

CREATE TABLE IF NOT EXISTS fee_receipt_sequences (
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  fy_label text NOT NULL, next_no integer NOT NULL DEFAULT 1,
  PRIMARY KEY (institution_id, campus_id, fy_label)
);
CREATE TABLE IF NOT EXISTS fee_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE RESTRICT, student_id uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  payment_group_id uuid NOT NULL, receipt_no text NOT NULL, fy_label text NOT NULL, amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  method text NOT NULL, line_snapshot jsonb NOT NULL, pdf_storage_ref text,
  vault_document_id uuid REFERENCES student_document_vault(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','cancelled')), cancelled_reason text,
  issued_by uuid REFERENCES institution_users(id) ON DELETE SET NULL, issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, campus_id, receipt_no)
);
CREATE INDEX IF NOT EXISTS fee_receipts_student_idx ON fee_receipts(student_id, issued_at DESC);
ALTER TABLE fee_receipts ADD COLUMN IF NOT EXISTS refund_status text;
ALTER TABLE fee_receipts ADD COLUMN IF NOT EXISTS refund_amount_minor integer;
ALTER TABLE fee_receipts ADD COLUMN IF NOT EXISTS refund_reason text;
ALTER TABLE fee_receipts ADD COLUMN IF NOT EXISTS refund_proposed_by uuid REFERENCES institution_users(id) ON DELETE SET NULL;
ALTER TABLE fee_receipts ADD COLUMN IF NOT EXISTS refund_second_approved_by uuid REFERENCES institution_users(id) ON DELETE SET NULL;
ALTER TABLE fee_receipts ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
ALTER TABLE fee_receipts DROP CONSTRAINT IF EXISTS fee_receipts_refund_status_check;
ALTER TABLE fee_receipts ADD CONSTRAINT fee_receipts_refund_status_check CHECK (refund_status IS NULL OR refund_status IN ('pending_second_approval','posted','rejected'));

ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'desk';
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS payment_state text NOT NULL DEFAULT 'captured';
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS instrument jsonb;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS receipt_id uuid REFERENCES fee_receipts(id) ON DELETE SET NULL;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS recorded_by uuid REFERENCES institution_users(id) ON DELETE SET NULL;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS intent_id uuid;
ALTER TABLE fee_payments DROP CONSTRAINT IF EXISTS fee_payments_channel_check;
ALTER TABLE fee_payments ADD CONSTRAINT fee_payments_channel_check CHECK (channel IN ('online','desk'));
ALTER TABLE fee_payments DROP CONSTRAINT IF EXISTS fee_payments_state_check;
ALTER TABLE fee_payments ADD CONSTRAINT fee_payments_state_check CHECK (payment_state IN ('captured','pending_clearance','bounced','refund','bounce_reversal'));
ALTER TABLE fee_payments DROP CONSTRAINT IF EXISTS fee_payments_negative_check;
ALTER TABLE fee_payments ADD CONSTRAINT fee_payments_negative_check CHECK (amount >= 0 OR payment_state IN ('refund','bounce_reversal'));

ALTER TABLE parent_payment_intents ALTER COLUMN guardian_user_id DROP NOT NULL;
ALTER TABLE parent_payment_intents ADD COLUMN IF NOT EXISTS owner_kind text NOT NULL DEFAULT 'guardian';
ALTER TABLE parent_payment_intents ADD COLUMN IF NOT EXISTS student_user_id uuid REFERENCES institution_users(id) ON DELETE CASCADE;
ALTER TABLE parent_payment_intents ADD COLUMN IF NOT EXISTS invoice_ids uuid[];
ALTER TABLE parent_payment_intents ADD COLUMN IF NOT EXISTS dispute_request_id uuid REFERENCES student_requests(id) ON DELETE SET NULL;
UPDATE parent_payment_intents SET owner_kind='guardian', student_user_id=NULL WHERE owner_kind IS NULL OR guardian_user_id IS NOT NULL;
ALTER TABLE parent_payment_intents DROP CONSTRAINT IF EXISTS parent_payment_intents_owner_check;
ALTER TABLE parent_payment_intents ADD CONSTRAINT parent_payment_intents_owner_check CHECK (
  (owner_kind='guardian' AND guardian_user_id IS NOT NULL AND student_user_id IS NULL) OR
  (owner_kind='student' AND student_user_id IS NOT NULL AND guardian_user_id IS NULL)
);
ALTER TABLE parent_payment_intents DROP CONSTRAINT IF EXISTS parent_payment_intents_owner_kind_check;
ALTER TABLE parent_payment_intents ADD CONSTRAINT parent_payment_intents_owner_kind_check CHECK (owner_kind IN ('guardian','student'));
ALTER TABLE fee_payments ADD CONSTRAINT fee_payments_intent_fk FOREIGN KEY (intent_id) REFERENCES parent_payment_intents(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS fee_waivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE, invoice_id uuid NOT NULL REFERENCES fee_invoices(id) ON DELETE CASCADE,
  label text NOT NULL, amount_minor integer NOT NULL CHECK (amount_minor > 0), reason text NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','pending_second_approval','approved','rejected','posted')),
  proposed_by uuid NOT NULL REFERENCES institution_users(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES institution_users(id) ON DELETE SET NULL,
  second_approved_by uuid REFERENCES institution_users(id) ON DELETE SET NULL,
  threshold_snapshot_minor integer NOT NULL, request_id uuid REFERENCES student_requests(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fee_gateway_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  gateway text NOT NULL, provider_event_id text NOT NULL, event_type text NOT NULL, payload jsonb NOT NULL,
  signature_valid boolean NOT NULL, outcome text NOT NULL CHECK (outcome IN ('applied','duplicate','unmatched','invalid_signature','amount_mismatch')),
  processed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (gateway, provider_event_id)
);

CREATE TABLE IF NOT EXISTS institution_fee_config (
  institution_id uuid PRIMARY KEY REFERENCES institutions(id) ON DELETE CASCADE,
  partial_payment_allowed boolean NOT NULL DEFAULT false,
  waiver_two_person_threshold_minor integer NOT NULL DEFAULT 1000000,
  refund_two_person_threshold_minor integer NOT NULL DEFAULT 500000,
  dues_block jsonb NOT NULL DEFAULT '{"hall_ticket":false,"result":false,"tc":false,"threshold_mode":"any_overdue","grace_days":0}'::jsonb,
  reminder_offsets integer[] NOT NULL DEFAULT ARRAY[7,3,1], receipt_template_ref text,
  late_fee_run_hour integer NOT NULL DEFAULT 2 CHECK (late_fee_run_hour BETWEEN 0 AND 23),
  bounce_fee_minor integer NOT NULL DEFAULT 0, tally_ledger_map jsonb, version integer NOT NULL DEFAULT 0,
  created_by uuid, updated_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE student_requests ADD CONSTRAINT student_requests_payment_invoice_fk
  FOREIGN KEY (payment_request_id) REFERENCES fee_invoices(id) ON DELETE SET NULL;
ALTER TABLE student_document_vault ALTER COLUMN issued_by DROP NOT NULL;

CREATE OR REPLACE FUNCTION reject_fee_immutable_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'fee_payments' AND NEW.amount IS DISTINCT FROM OLD.amount THEN RAISE EXCEPTION 'fee payment amount is immutable'; END IF;
  IF TG_TABLE_NAME = 'fee_receipts' AND (NEW.amount_minor,NEW.receipt_no,NEW.line_snapshot) IS DISTINCT FROM (OLD.amount_minor,OLD.receipt_no,OLD.line_snapshot) THEN RAISE EXCEPTION 'fee receipt financial fields are immutable'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fee_payments_immutable_amount ON fee_payments;
CREATE TRIGGER fee_payments_immutable_amount BEFORE UPDATE ON fee_payments FOR EACH ROW EXECUTE FUNCTION reject_fee_immutable_change();
DROP TRIGGER IF EXISTS fee_receipts_immutable_financials ON fee_receipts;
CREATE TRIGGER fee_receipts_immutable_financials BEFORE UPDATE ON fee_receipts FOR EACH ROW EXECUTE FUNCTION reject_fee_immutable_change();

GRANT SELECT, INSERT ON fee_invoice_items, fee_structure_versions, fee_receipts, fee_receipt_sequences, fee_waivers, fee_gateway_events, institution_fee_config TO edrion_app;
GRANT UPDATE ON fee_structure_versions, fee_receipt_sequences, fee_waivers, institution_fee_config TO edrion_app;
GRANT UPDATE (status, cancelled_reason, pdf_storage_ref, vault_document_id, refund_status, refund_amount_minor, refund_reason, refund_proposed_by, refund_second_approved_by, version) ON fee_receipts TO edrion_app;
REVOKE UPDATE, DELETE, TRUNCATE ON fee_invoice_items, fee_gateway_events FROM edrion_app;
REVOKE DELETE, TRUNCATE ON fee_receipts, fee_structure_versions, fee_receipt_sequences, fee_waivers, institution_fee_config, fee_payments FROM edrion_app;
