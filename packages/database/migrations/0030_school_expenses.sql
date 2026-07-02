CREATE TABLE IF NOT EXISTS "school_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"title" text NOT NULL,
	"category" text DEFAULT 'misc' NOT NULL,
	"vendor" text,
	"amount" integer DEFAULT 0 NOT NULL,
	"method" text DEFAULT 'bank_transfer' NOT NULL,
	"reference" text,
	"expense_date" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "school_expenses" ADD CONSTRAINT "school_expenses_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "school_expenses" ADD CONSTRAINT "school_expenses_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "school_expenses_institution_idx" ON "school_expenses" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "school_expenses_institution_campus_idx" ON "school_expenses" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "school_expenses_category_idx" ON "school_expenses" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "school_expenses_status_idx" ON "school_expenses" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "school_expenses_date_idx" ON "school_expenses" USING btree ("institution_id","expense_date");
