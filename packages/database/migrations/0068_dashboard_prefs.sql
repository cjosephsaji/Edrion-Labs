CREATE TABLE IF NOT EXISTS "institution_user_dashboard_prefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_user_id" uuid NOT NULL,
	"hidden_widgets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pinned_widgets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active_persona" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institution_user_dashboard_prefs_institution_user_id_unique" UNIQUE("institution_user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "institution_user_dashboard_prefs" ADD CONSTRAINT "institution_user_dashboard_prefs_institution_user_id_institution_users_id_fk" FOREIGN KEY ("institution_user_id") REFERENCES "public"."institution_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
