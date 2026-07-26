-- Request Engine Phase 1: request/event/config/vault tables and document sign-off metadata.

ALTER TABLE "document_templates"
  ADD COLUMN IF NOT EXISTS "requires_sign_off" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

INSERT INTO "feature_definitions" (
  "id", "key", "name", "description", "module", "status", "default_value",
  "available_scopes", "created_at", "updated_at"
)
VALUES (
  gen_random_uuid(),
  'student.surface.requests',
  'Student requests surface',
  'Allow institution-bound students to create and track requests',
  'student-portal',
  'active',
  false,
  '["institution","campus","institution_user"]'::jsonb,
  now(),
  now()
)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "student_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "campus_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "payload_schema_version" integer NOT NULL,
  "status" text NOT NULL,
  "human_code" text NOT NULL,
  "assigned_role" text NOT NULL,
  "assigned_user_id" uuid,
  "decision_note" text,
  "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "needs_info_question" text,
  "sla_due_at" timestamp with time zone,
  "payment_request_id" uuid,
  "fulfilment_document_id" uuid,
  "submitted_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "version" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "student_requests_status_check" CHECK (
    "status" IN (
      'draft', 'submitted', 'in_review', 'needs_info', 'approved', 'rejected',
      'fulfilled', 'cancelled', 'expired'
    )
  ),
  CONSTRAINT "student_requests_human_code_check"
    CHECK ("human_code" ~ '^[A-Z]{2}-[A-HJ-NP-Z2-9]{4,5}$'),
  CONSTRAINT "student_requests_attachments_array_check"
    CHECK (jsonb_typeof("attachments") = 'array')
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "student_request_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL,
  "institution_id" uuid NOT NULL,
  "seq" integer NOT NULL,
  "event_type" text NOT NULL,
  "actor_kind" text NOT NULL,
  "actor_user_id" uuid,
  "actor_role" text,
  "note" text,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "student_request_events_event_type_check" CHECK (
    "event_type" IN (
      'created', 'submitted', 'claimed', 'unclaimed', 'reassigned', 'info_requested',
      'info_provided', 'approved', 'rejected', 'fulfilled', 'cancelled', 'expired',
      'note_added'
    )
  ),
  CONSTRAINT "student_request_events_actor_kind_check"
    CHECK ("actor_kind" IN ('student', 'staff', 'system')),
  CONSTRAINT "student_request_events_seq_check" CHECK ("seq" > 0)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "institution_request_type_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "type_key" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "routing_role_override" text,
  "sla_days_override" integer,
  "label_override" text,
  "version" integer DEFAULT 0 NOT NULL,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "institution_request_type_config_sla_days_check"
    CHECK ("sla_days_override" IS NULL OR "sla_days_override" >= 0)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "student_document_vault" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "request_id" uuid,
  "document_render_id" uuid NOT NULL,
  "title" text NOT NULL,
  "doc_type" text NOT NULL,
  "verify_code" text NOT NULL,
  "issued_by" uuid NOT NULL,
  "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_reason" text,
  CONSTRAINT "student_document_vault_verify_code_check"
    CHECK (char_length("verify_code") = 12)
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "student_requests"
    ADD CONSTRAINT "student_requests_institution_id_institutions_id_fk"
    FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_requests"
    ADD CONSTRAINT "student_requests_campus_id_campuses_id_fk"
    FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id")
    ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_requests"
    ADD CONSTRAINT "student_requests_student_id_students_id_fk"
    FOREIGN KEY ("student_id") REFERENCES "public"."students"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_requests"
    ADD CONSTRAINT "student_requests_assigned_user_id_institution_users_id_fk"
    FOREIGN KEY ("assigned_user_id") REFERENCES "public"."institution_users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "student_request_events"
    ADD CONSTRAINT "student_request_events_request_id_student_requests_id_fk"
    FOREIGN KEY ("request_id") REFERENCES "public"."student_requests"("id")
    ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_request_events"
    ADD CONSTRAINT "student_request_events_institution_id_institutions_id_fk"
    FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id")
    ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "institution_request_type_config"
    ADD CONSTRAINT "institution_request_type_config_institution_id_institutions_id_fk"
    FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "student_document_vault"
    ADD CONSTRAINT "student_document_vault_institution_id_institutions_id_fk"
    FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_document_vault"
    ADD CONSTRAINT "student_document_vault_student_id_students_id_fk"
    FOREIGN KEY ("student_id") REFERENCES "public"."students"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_document_vault"
    ADD CONSTRAINT "student_document_vault_request_id_student_requests_id_fk"
    FOREIGN KEY ("request_id") REFERENCES "public"."student_requests"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_document_vault"
    ADD CONSTRAINT "student_document_vault_document_render_id_document_renders_id_fk"
    FOREIGN KEY ("document_render_id") REFERENCES "public"."document_renders"("id")
    ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_document_vault"
    ADD CONSTRAINT "student_document_vault_issued_by_institution_users_id_fk"
    FOREIGN KEY ("issued_by") REFERENCES "public"."institution_users"("id")
    ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_requests"
    ADD CONSTRAINT "student_requests_fulfilment_document_id_student_document_vault_id_fk"
    FOREIGN KEY ("fulfilment_document_id") REFERENCES "public"."student_document_vault"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "student_requests_human_code_uniq"
  ON "student_requests" USING btree ("institution_id", "human_code");
CREATE INDEX IF NOT EXISTS "student_requests_student_timeline_idx"
  ON "student_requests" USING btree ("institution_id", "student_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "student_requests_inbox_idx"
  ON "student_requests" USING btree ("institution_id", "assigned_role", "status")
  WHERE "status" IN ('draft', 'submitted', 'in_review', 'needs_info', 'approved');
CREATE INDEX IF NOT EXISTS "student_requests_sla_idx"
  ON "student_requests" USING btree ("institution_id", "sla_due_at")
  WHERE "status" IN ('submitted', 'in_review', 'needs_info');
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "student_request_events_request_seq_uniq"
  ON "student_request_events" USING btree ("request_id", "seq");
CREATE INDEX IF NOT EXISTS "student_request_events_request_timeline_idx"
  ON "student_request_events" USING btree ("request_id", "created_at");
CREATE INDEX IF NOT EXISTS "student_request_events_institution_idx"
  ON "student_request_events" USING btree ("institution_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "institution_request_type_config_type_uniq"
  ON "institution_request_type_config" USING btree ("institution_id", "type_key");
CREATE INDEX IF NOT EXISTS "institution_request_type_config_institution_idx"
  ON "institution_request_type_config" USING btree ("institution_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "student_document_vault_verify_code_uniq"
  ON "student_document_vault" USING btree ("verify_code");
CREATE UNIQUE INDEX IF NOT EXISTS "student_document_vault_render_uniq"
  ON "student_document_vault" USING btree ("document_render_id");
CREATE INDEX IF NOT EXISTS "student_document_vault_student_idx"
  ON "student_document_vault" USING btree ("institution_id", "student_id");
CREATE INDEX IF NOT EXISTS "student_document_vault_request_idx"
  ON "student_document_vault" USING btree ("request_id");

COMMENT ON COLUMN "student_requests"."attachments" IS
  'Array of storage_objects references: {storage_object_id, filename, mime, bytes}; validated through StudentStorageService.';
COMMENT ON COLUMN "student_requests"."payment_request_id" IS
  'Reserved for the Fees feature payable-line FK; target table does not exist yet.';
