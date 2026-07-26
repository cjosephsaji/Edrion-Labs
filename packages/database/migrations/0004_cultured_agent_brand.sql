CREATE TABLE IF NOT EXISTS "campus_billing_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid NOT NULL,
	"subscription_id" uuid,
	"invoice_id" uuid,
	"billing_status" text DEFAULT 'paid_addon' NOT NULL,
	"unit_price_minor" integer DEFAULT 0 NOT NULL,
	"prorated_minor" integer DEFAULT 0 NOT NULL,
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"subscription_id" uuid,
	"amount_minor" integer DEFAULT 0 NOT NULL,
	"remaining_minor" integer DEFAULT 0 NOT NULL,
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"reason" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"institution_id" uuid,
	"kind" text DEFAULT 'percentage' NOT NULL,
	"value_bps" integer,
	"value_minor" integer,
	"currency" "currency",
	"applies_to" text DEFAULT 'invoice' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discounts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"scope" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"entity_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" text DEFAULT 'subscription' NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_minor" integer DEFAULT 0 NOT NULL,
	"amount_minor" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text,
	"institution_id" uuid NOT NULL,
	"subscription_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"subtotal_minor" integer DEFAULT 0 NOT NULL,
	"discount_minor" integer DEFAULT 0 NOT NULL,
	"tax_minor" integer DEFAULT 0 NOT NULL,
	"total_minor" integer DEFAULT 0 NOT NULL,
	"amount_paid_minor" integer DEFAULT 0 NOT NULL,
	"amount_due_minor" integer DEFAULT 0 NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"issued_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"dunning_state" text DEFAULT 'none' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"invoice_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"method" text DEFAULT 'card' NOT NULL,
	"amount_minor" integer DEFAULT 0 NOT NULL,
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"provider" text DEFAULT 'manual' NOT NULL,
	"provider_ref" text,
	"failure_reason" text,
	"idempotency_key" text,
	"processed_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid,
	"institution_id" uuid NOT NULL,
	"amount_minor" integer DEFAULT 0 NOT NULL,
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"reason" text,
	"status" text DEFAULT 'succeeded' NOT NULL,
	"provider_ref" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"subscription_id" uuid,
	"metric" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campus_billing_items" ADD CONSTRAINT "campus_billing_items_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credits" ADD CONSTRAINT "credits_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refunds" ADD CONSTRAINT "refunds_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_metrics" ADD CONSTRAINT "usage_metrics_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campus_billing_items_institution_idx" ON "campus_billing_items" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credits_institution_idx" ON "credits" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idempotency_keys_key_idx" ON "idempotency_keys" USING btree ("key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_institution_idx" ON "invoices" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_institution_idx" ON "payments" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_metrics_institution_idx" ON "usage_metrics" USING btree ("institution_id");