-- Petros Phase 4: document generation engine (Handlebars-in-DB templates + render queue).

CREATE TABLE IF NOT EXISTS "document_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid,
	"doc_type" text NOT NULL,
	"name" text NOT NULL,
	"engine" text DEFAULT 'handlebars' NOT NULL,
	"html" text NOT NULL,
	"css" text DEFAULT '' NOT NULL,
	"fields_schema" jsonb DEFAULT '{}'::jsonb,
	"header_config" jsonb DEFAULT '{}'::jsonb,
	"applies_to_types" jsonb DEFAULT '[]'::jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_renders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"template_id" uuid,
	"doc_type" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"conversation_id" uuid,
	"run_id" uuid,
	"title" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"artifact_id" uuid,
	"storage_path" text,
	"error_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_renders" ADD CONSTRAINT "document_renders_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_renders" ADD CONSTRAINT "document_renders_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_templates_institution_idx" ON "document_templates" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_templates_doc_type_idx" ON "document_templates" USING btree ("doc_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_renders_institution_idx" ON "document_renders" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_renders_status_idx" ON "document_renders" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_renders_conversation_idx" ON "document_renders" USING btree ("conversation_id");
