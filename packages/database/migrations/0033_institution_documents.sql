CREATE TABLE IF NOT EXISTS "institution_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"title" text NOT NULL,
	"category" text DEFAULT 'policy' NOT NULL,
	"description" text,
	"url" text NOT NULL,
	"storage_key" text,
	"requires_ack" boolean DEFAULT false NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "institution_documents" ADD CONSTRAINT "institution_documents_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "institution_documents" ADD CONSTRAINT "institution_documents_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "institution_documents_institution_idx" ON "institution_documents" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "institution_documents_institution_campus_idx" ON "institution_documents" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "institution_documents_category_idx" ON "institution_documents" USING btree ("category");
