-- Documents / Issuance / Report Cards — base storage (PLAN-DOCUMENTS Phase C1).
-- Extends document_templates, document_renders, student_document_vault in place.
-- Adds document_catalog, document_batches, document_batch_items, report_card_reviews.
-- Number is 0098 because 0097 is student_tutor_policy_domain.

-- ── document_templates extensions ─────────────────────────────────────────────
ALTER TABLE "document_templates"
  ADD COLUMN IF NOT EXISTS "active" boolean NOT NULL DEFAULT true;
ALTER TABLE "document_templates"
  ADD COLUMN IF NOT EXISTS "platform_template_key" text;
ALTER TABLE "document_templates"
  ADD COLUMN IF NOT EXISTS "family" text;

UPDATE "document_templates"
SET "family" = CASE
  WHEN "doc_type" IN ('bonafide', 'transcript', 'certificate', 'migration', 'conduct', 'letter') THEN 'certificate'
  WHEN "doc_type" IN ('receipt') THEN 'receipt'
  WHEN "doc_type" IN ('hall_ticket') THEN 'hall_ticket'
  WHEN "doc_type" IN ('id_card') THEN 'id_card'
  WHEN "doc_type" IN ('report', 'report_card') THEN 'report_card'
  WHEN "doc_type" IN ('individual_report') THEN 'individual_report'
  ELSE 'certificate'
END
WHERE "family" IS NULL;

-- ── document_renders dual-owner + purpose / provenance ────────────────────────
ALTER TABLE "document_renders" ALTER COLUMN "institution_id" DROP NOT NULL;
ALTER TABLE "document_renders"
  ADD COLUMN IF NOT EXISTS "student_id" uuid;
ALTER TABLE "document_renders"
  ADD COLUMN IF NOT EXISTS "independent_user_id" uuid;
ALTER TABLE "document_renders"
  ADD COLUMN IF NOT EXISTS "purpose" text NOT NULL DEFAULT 'issuance';
ALTER TABLE "document_renders"
  ADD COLUMN IF NOT EXISTS "family" text;
ALTER TABLE "document_renders"
  ADD COLUMN IF NOT EXISTS "ref_type" text;
ALTER TABLE "document_renders"
  ADD COLUMN IF NOT EXISTS "ref_id" uuid;
ALTER TABLE "document_renders"
  ADD COLUMN IF NOT EXISTS "batch_item_id" uuid;
ALTER TABLE "document_renders"
  ADD COLUMN IF NOT EXISTS "template_fingerprint" text;
ALTER TABLE "document_renders"
  ADD COLUMN IF NOT EXISTS "attempt_no" integer NOT NULL DEFAULT 1;
ALTER TABLE "document_renders"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;
ALTER TABLE "document_renders"
  ADD COLUMN IF NOT EXISTS "generation_key" text;

DO $$ BEGIN
  ALTER TABLE "document_renders"
    ADD CONSTRAINT "document_renders_student_id_fk"
    FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "document_renders"
    ADD CONSTRAINT "document_renders_independent_user_id_fk"
    FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

ALTER TABLE "document_renders" DROP CONSTRAINT IF EXISTS "document_renders_owner_ck";
ALTER TABLE "document_renders"
  ADD CONSTRAINT "document_renders_owner_ck" CHECK (
    (
      "institution_id" IS NOT NULL
      AND "student_id" IS NOT NULL
      AND "independent_user_id" IS NULL
    )
    OR (
      "institution_id" IS NULL
      AND "student_id" IS NULL
      AND "independent_user_id" IS NOT NULL
    )
    OR (
      "institution_id" IS NOT NULL
      AND "student_id" IS NULL
      AND "independent_user_id" IS NULL
    )
  );

ALTER TABLE "document_renders" DROP CONSTRAINT IF EXISTS "document_renders_purpose_ck";
ALTER TABLE "document_renders"
  ADD CONSTRAINT "document_renders_purpose_ck" CHECK (
    "purpose" IN ('issuance', 'preview', 'batch', 'reissue', 'signature')
  );

CREATE UNIQUE INDEX IF NOT EXISTS "document_renders_idempotency_uniq"
  ON "document_renders" ("institution_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL AND "institution_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "document_renders_ref_idx"
  ON "document_renders" ("ref_type", "ref_id");
CREATE INDEX IF NOT EXISTS "document_renders_purpose_idx"
  ON "document_renders" ("purpose", "status");

-- ── document_catalog ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "document_catalog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL REFERENCES "institutions"("id") ON DELETE cascade,
  "subtype_key" text NOT NULL,
  "family" text NOT NULL,
  "doc_type" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "active" boolean NOT NULL DEFAULT true,
  "eligibility_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "delivery_modes" jsonb NOT NULL DEFAULT '["digital"]'::jsonb,
  "template_id" uuid REFERENCES "document_templates"("id") ON DELETE set null,
  "fee_head_id" uuid,
  "fee_amount_minor" integer NOT NULL DEFAULT 0,
  "requires_payment" boolean NOT NULL DEFAULT false,
  "sla_routing_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "required_fields" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "payload_schema_version" integer NOT NULL DEFAULT 1,
  "version" integer NOT NULL DEFAULT 0,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "document_catalog_family_ck" CHECK (
    "family" IN ('certificate', 'receipt', 'hall_ticket', 'id_card', 'report_card', 'individual_report')
  ),
  CONSTRAINT "document_catalog_fee_amount_ck" CHECK ("fee_amount_minor" >= 0),
  CONSTRAINT "document_catalog_subtype_uniq" UNIQUE ("institution_id", "subtype_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_catalog_institution_idx"
  ON "document_catalog" ("institution_id");
CREATE INDEX IF NOT EXISTS "document_catalog_active_idx"
  ON "document_catalog" ("institution_id", "active");

-- ── document_batches ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "document_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL REFERENCES "institutions"("id") ON DELETE cascade,
  "campus_id" uuid REFERENCES "campuses"("id") ON DELETE set null,
  "kind" text NOT NULL,
  "template_id" uuid REFERENCES "document_templates"("id") ON DELETE set null,
  "template_fingerprint" text,
  "scope" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'draft',
  "counts" jsonb NOT NULL DEFAULT '{"total":0,"rendered":0,"failed":0,"signed":0,"delivered":0}'::jsonb,
  "population_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "locked_at" timestamptz,
  "created_by" uuid,
  "version" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "document_batches_kind_ck" CHECK (
    "kind" IN ('hall_ticket', 'id_card', 'report_card', 'manual_upload')
  ),
  CONSTRAINT "document_batches_status_ck" CHECK (
    "status" IN (
      'draft', 'generating', 'review', 'signing', 'delivering',
      'completed', 'completed_with_errors', 'cancelled'
    )
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_batches_institution_idx"
  ON "document_batches" ("institution_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "document_batches_status_idx"
  ON "document_batches" ("institution_id", "status");

-- ── document_batch_items ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "document_batch_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "batch_id" uuid NOT NULL REFERENCES "document_batches"("id") ON DELETE cascade,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE cascade,
  "status" text NOT NULL DEFAULT 'pending',
  "render_id" uuid REFERENCES "document_renders"("id") ON DELETE set null,
  "vault_document_id" uuid,
  "error" jsonb,
  "merge_snapshot" jsonb,
  "source_snapshot" jsonb,
  "sign_state" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "review_flag" jsonb,
  "version" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "document_batch_items_status_ck" CHECK (
    "status" IN ('pending', 'rendering', 'rendered', 'failed', 'excluded', 'delivered')
  ),
  CONSTRAINT "document_batch_items_batch_student_uniq" UNIQUE ("batch_id", "student_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_batch_items_batch_idx"
  ON "document_batch_items" ("batch_id", "status");
CREATE INDEX IF NOT EXISTS "document_batch_items_student_idx"
  ON "document_batch_items" ("student_id");

-- FK from renders.batch_item_id now that items exist
DO $$ BEGIN
  ALTER TABLE "document_renders"
    ADD CONSTRAINT "document_renders_batch_item_id_fk"
    FOREIGN KEY ("batch_item_id") REFERENCES "public"."document_batch_items"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- ── report_card_reviews ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "report_card_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "batch_id" uuid NOT NULL REFERENCES "document_batches"("id") ON DELETE cascade,
  "section_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "reviewed_by" uuid,
  "reviewed_at" timestamptz,
  "version" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "report_card_reviews_status_ck" CHECK (
    "status" IN ('pending', 'reviewed', 'flagged')
  ),
  CONSTRAINT "report_card_reviews_batch_section_uniq" UNIQUE ("batch_id", "section_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_card_reviews_batch_idx"
  ON "report_card_reviews" ("batch_id");

-- ── report_card_remarks (optional teacher remarks for merge) ──────────────────
CREATE TABLE IF NOT EXISTS "report_card_remarks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL REFERENCES "institutions"("id") ON DELETE cascade,
  "term_id" uuid NOT NULL,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE cascade,
  "remark" text NOT NULL,
  "author_id" uuid,
  "version" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "report_card_remarks_len_ck" CHECK (char_length("remark") BETWEEN 1 AND 400),
  CONSTRAINT "report_card_remarks_uniq" UNIQUE ("institution_id", "term_id", "student_id")
);
--> statement-breakpoint

-- ── Evolve student_document_vault (NOT a new vault_documents table) ───────────
ALTER TABLE "student_document_vault" ALTER COLUMN "institution_id" DROP NOT NULL;
ALTER TABLE "student_document_vault" ALTER COLUMN "student_id" DROP NOT NULL;
ALTER TABLE "student_document_vault" ALTER COLUMN "document_render_id" DROP NOT NULL;

ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "independent_user_id" uuid;
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "storage_key" text;
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "family" text;
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'request';
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "template_id" uuid;
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "template_fingerprint" text;
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "batch_id" uuid;
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "batch_item_id" uuid;
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "academic_year" text;
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "delivered_at" timestamptz;
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "delivery_mode" text;
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "pickup_ready_at" timestamptz;
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "pickup_note" text;
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "collected_at" timestamptz;
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "collected_by" uuid;
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "superseded_by" uuid;
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "supersedes" uuid;
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "reissue_reason" text;
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "abandoned_at" timestamptz;
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "verify_code_version" integer NOT NULL DEFAULT 0;
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 0;
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "created_at" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "student_document_vault"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();

-- Backfill family from doc_type for existing rows
UPDATE "student_document_vault"
SET "family" = CASE
  WHEN "doc_type" IN ('bonafide', 'transcript', 'certificate', 'migration', 'conduct', 'letter') THEN 'certificate'
  WHEN "doc_type" = 'receipt' THEN 'receipt'
  WHEN "doc_type" = 'hall_ticket' THEN 'hall_ticket'
  WHEN "doc_type" = 'id_card' THEN 'id_card'
  WHEN "doc_type" IN ('report', 'report_card') THEN 'report_card'
  ELSE 'certificate'
END
WHERE "family" IS NULL;

-- Existing issued vault rows are treated as already delivered
UPDATE "student_document_vault"
SET "delivered_at" = COALESCE("delivered_at", "issued_at")
WHERE "delivered_at" IS NULL AND "revoked_at" IS NULL AND "abandoned_at" IS NULL;

DO $$ BEGIN
  ALTER TABLE "student_document_vault"
    ADD CONSTRAINT "student_document_vault_independent_user_id_fk"
    FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_document_vault"
    ADD CONSTRAINT "student_document_vault_template_id_fk"
    FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_document_vault"
    ADD CONSTRAINT "student_document_vault_batch_id_fk"
    FOREIGN KEY ("batch_id") REFERENCES "public"."document_batches"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_document_vault"
    ADD CONSTRAINT "student_document_vault_batch_item_id_fk"
    FOREIGN KEY ("batch_item_id") REFERENCES "public"."document_batch_items"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_document_vault"
    ADD CONSTRAINT "student_document_vault_superseded_by_fk"
    FOREIGN KEY ("superseded_by") REFERENCES "public"."student_document_vault"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_document_vault"
    ADD CONSTRAINT "student_document_vault_supersedes_fk"
    FOREIGN KEY ("supersedes") REFERENCES "public"."student_document_vault"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- Dual-owner CHECK (repo convention: institution+student XOR independent_user_id)
ALTER TABLE "student_document_vault" DROP CONSTRAINT IF EXISTS "student_document_vault_owner_ck";
ALTER TABLE "student_document_vault"
  ADD CONSTRAINT "student_document_vault_owner_ck" CHECK (
    (
      "institution_id" IS NOT NULL
      AND "student_id" IS NOT NULL
      AND "independent_user_id" IS NULL
    )
    OR (
      "institution_id" IS NULL
      AND "student_id" IS NULL
      AND "independent_user_id" IS NOT NULL
    )
  );

ALTER TABLE "student_document_vault" DROP CONSTRAINT IF EXISTS "student_document_vault_source_ck";
ALTER TABLE "student_document_vault"
  ADD CONSTRAINT "student_document_vault_source_ck" CHECK (
    "source" IN ('request', 'batch', 'manual_upload', 'system')
  );

ALTER TABLE "student_document_vault" DROP CONSTRAINT IF EXISTS "student_document_vault_family_ck";
ALTER TABLE "student_document_vault"
  ADD CONSTRAINT "student_document_vault_family_ck" CHECK (
    "family" IS NULL OR "family" IN (
      'certificate', 'receipt', 'hall_ticket', 'id_card', 'report_card', 'individual_report'
    )
  );

-- Artifact source: render OR manual storage_key required before delivery (enforced at service for drafts)
ALTER TABLE "student_document_vault" DROP CONSTRAINT IF EXISTS "student_document_vault_artifact_ck";
ALTER TABLE "student_document_vault"
  ADD CONSTRAINT "student_document_vault_artifact_ck" CHECK (
    "delivered_at" IS NULL
    OR "document_render_id" IS NOT NULL
    OR "storage_key" IS NOT NULL
  );

-- Render uniqueness becomes partial (manual uploads have NULL render)
DROP INDEX IF EXISTS "student_document_vault_render_uniq";
CREATE UNIQUE INDEX IF NOT EXISTS "student_document_vault_render_uniq"
  ON "student_document_vault" ("document_render_id")
  WHERE "document_render_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "student_document_vault_inst_student_delivered_idx"
  ON "student_document_vault" ("institution_id", "student_id", "delivered_at" DESC)
  WHERE "institution_id" IS NOT NULL AND "abandoned_at" IS NULL;
CREATE INDEX IF NOT EXISTS "student_document_vault_independent_delivered_idx"
  ON "student_document_vault" ("independent_user_id", "delivered_at" DESC)
  WHERE "independent_user_id" IS NOT NULL AND "abandoned_at" IS NULL;
CREATE INDEX IF NOT EXISTS "student_document_vault_family_idx"
  ON "student_document_vault" ("family")
  WHERE "abandoned_at" IS NULL;
CREATE INDEX IF NOT EXISTS "student_document_vault_batch_idx"
  ON "student_document_vault" ("batch_id")
  WHERE "batch_id" IS NOT NULL;

-- Batch item vault FK (after vault columns exist)
DO $$ BEGIN
  ALTER TABLE "document_batch_items"
    ADD CONSTRAINT "document_batch_items_vault_document_id_fk"
    FOREIGN KEY ("vault_document_id") REFERENCES "public"."student_document_vault"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- Feature flags
INSERT INTO "feature_definitions" (
  "id", "key", "name", "description", "module", "status", "default_value", "available_scopes", "created_at", "updated_at"
)
VALUES
  (
    gen_random_uuid(),
    'institution.documents.templates',
    'Document templates',
    'Institution Handlebars template manager for issuance',
    'documents',
    'active',
    false,
    '["institution"]'::jsonb,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'institution.documents.issuance',
    'Document issuance desk',
    'Issuance queue, batches, and register',
    'documents',
    'active',
    false,
    '["institution"]'::jsonb,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'institution.documents.report_cards',
    'Report card generator',
    'Report-card batch generation with teacher review',
    'documents',
    'active',
    false,
    '["institution"]'::jsonb,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'student.surface.documents',
    'Student documents vault',
    'Student vault of issued documents',
    'student',
    'active',
    false,
    '["institution","plan"]'::jsonb,
    now(),
    now()
  )
ON CONFLICT ("key") DO NOTHING;
