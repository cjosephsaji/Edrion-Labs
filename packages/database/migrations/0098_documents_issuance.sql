-- Tier 2 Documents C1: issuance catalog, batches, vault/render extensions.

ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS platform_template_key text,
  ADD COLUMN IF NOT EXISTS family text;
--> statement-breakpoint

ALTER TABLE document_renders
  ALTER COLUMN institution_id DROP NOT NULL;
--> statement-breakpoint

ALTER TABLE document_renders
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS independent_user_id uuid REFERENCES independent_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'issuance',
  ADD COLUMN IF NOT EXISTS family text,
  ADD COLUMN IF NOT EXISTS ref_type text,
  ADD COLUMN IF NOT EXISTS ref_id uuid,
  ADD COLUMN IF NOT EXISTS batch_item_id uuid,
  ADD COLUMN IF NOT EXISTS template_fingerprint text,
  ADD COLUMN IF NOT EXISTS attempt_no integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS generation_key text;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE document_renders ADD CONSTRAINT document_renders_purpose_ck CHECK (
    purpose IN ('issuance', 'preview', 'batch', 'reissue', 'signature')
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS document_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  subtype_key text NOT NULL,
  family text NOT NULL,
  doc_type text NOT NULL,
  title text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  eligibility_config jsonb NOT NULL DEFAULT '{}',
  delivery_modes jsonb NOT NULL DEFAULT '[]',
  template_id uuid REFERENCES document_templates(id) ON DELETE SET NULL,
  fee_head_id uuid,
  fee_amount_minor integer NOT NULL DEFAULT 0,
  requires_payment boolean NOT NULL DEFAULT false,
  sla_config jsonb NOT NULL DEFAULT '{}',
  payload_schema_version integer NOT NULL DEFAULT 1,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_catalog_fee_nonneg_ck CHECK (fee_amount_minor >= 0)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS document_catalog_inst_subtype_uq
  ON document_catalog (institution_id, subtype_key);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS document_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES campuses(id) ON DELETE SET NULL,
  kind text NOT NULL,
  template_id uuid REFERENCES document_templates(id) ON DELETE SET NULL,
  template_fingerprint text,
  scope jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',
  counts jsonb NOT NULL DEFAULT '{}',
  population_snapshot jsonb NOT NULL DEFAULT '{}',
  locked_at timestamptz,
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_batches_kind_ck CHECK (
    kind IN ('hall_ticket', 'id_card', 'report_card', 'manual_upload')
  ),
  CONSTRAINT document_batches_status_ck CHECK (
    status IN (
      'draft', 'generating', 'review', 'signing', 'delivering',
      'completed', 'completed_with_errors', 'cancelled'
    )
  )
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS document_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  batch_id uuid NOT NULL REFERENCES document_batches(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  document_render_id uuid REFERENCES document_renders(id) ON DELETE SET NULL,
  vault_id uuid,
  error jsonb,
  merge_snapshot jsonb NOT NULL DEFAULT '{}',
  source_snapshot jsonb NOT NULL DEFAULT '{}',
  sign_state jsonb NOT NULL DEFAULT '{}',
  review_flag boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_batch_items_status_ck CHECK (
    status IN ('pending', 'rendering', 'rendered', 'failed', 'excluded', 'delivered')
  ),
  CONSTRAINT document_batch_items_batch_student_uq UNIQUE (batch_id, student_id)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS report_card_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  batch_id uuid NOT NULL REFERENCES document_batches(id) ON DELETE CASCADE,
  section_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewer_id uuid,
  reviewed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_card_reviews_status_ck CHECK (status IN ('pending', 'reviewed', 'flagged')),
  CONSTRAINT report_card_reviews_batch_section_uq UNIQUE (batch_id, section_id)
);
--> statement-breakpoint

ALTER TABLE student_document_vault
  ADD COLUMN IF NOT EXISTS independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS storage_key text,
  ADD COLUMN IF NOT EXISTS family text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'request',
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES document_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_fingerprint text,
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES document_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS batch_item_id uuid REFERENCES document_batch_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS academic_year text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_mode text,
  ADD COLUMN IF NOT EXISTS verify_code_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS superseded_by uuid,
  ADD COLUMN IF NOT EXISTS supersedes uuid,
  ADD COLUMN IF NOT EXISTS reissue_reason text,
  ADD COLUMN IF NOT EXISTS abandoned_at timestamptz,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
--> statement-breakpoint

ALTER TABLE student_document_vault
  ALTER COLUMN institution_id DROP NOT NULL,
  ALTER COLUMN student_id DROP NOT NULL,
  ALTER COLUMN document_render_id DROP NOT NULL;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE student_document_vault ADD CONSTRAINT student_document_vault_source_ck CHECK (
    source IN ('request', 'batch', 'manual_upload', 'system')
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
