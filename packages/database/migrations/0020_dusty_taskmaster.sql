CREATE TABLE IF NOT EXISTS "portal_ai_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"institution_user_id" uuid NOT NULL,
	"user_name" text,
	"method" text DEFAULT 'typed' NOT NULL,
	"confirmation_text" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"institution_user_id" uuid NOT NULL,
	"user_name" text,
	"prompt" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb,
	"context_sources" jsonb DEFAULT '[]'::jsonb,
	"status" "ai_action_status" DEFAULT 'proposed' NOT NULL,
	"summary" text,
	"model" text DEFAULT 'stub-planner' NOT NULL,
	"prompt_version" text,
	"risk_level" text,
	"duration_ms" integer,
	"error_detail" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_ai_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"tool_key" text NOT NULL,
	"capability" "ai_capability" NOT NULL,
	"args" jsonb DEFAULT '{}'::jsonb,
	"explanation" text,
	"required_permission" text,
	"decision" "ai_guardrail_decision" NOT NULL,
	"decision_layer" text,
	"decision_reason" text,
	"risk_level" text,
	"reversible" boolean DEFAULT true NOT NULL,
	"financial_impact_minor" integer,
	"affected_users" integer,
	"impact_preview" jsonb DEFAULT '{}'::jsonb,
	"status" "ai_action_status" DEFAULT 'proposed' NOT NULL,
	"result" jsonb,
	"audit_event_id" uuid,
	"error_detail" text,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portal_ai_confirmations" ADD CONSTRAINT "portal_ai_confirmations_run_id_portal_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."portal_ai_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portal_ai_confirmations" ADD CONSTRAINT "portal_ai_confirmations_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portal_ai_runs" ADD CONSTRAINT "portal_ai_runs_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portal_ai_runs" ADD CONSTRAINT "portal_ai_runs_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portal_ai_tool_calls" ADD CONSTRAINT "portal_ai_tool_calls_run_id_portal_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."portal_ai_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portal_ai_tool_calls" ADD CONSTRAINT "portal_ai_tool_calls_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_ai_confirmations_run_idx" ON "portal_ai_confirmations" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_ai_confirmations_institution_idx" ON "portal_ai_confirmations" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_ai_runs_institution_idx" ON "portal_ai_runs" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_ai_runs_institution_campus_idx" ON "portal_ai_runs" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_ai_runs_user_idx" ON "portal_ai_runs" USING btree ("institution_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_ai_runs_status_idx" ON "portal_ai_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_ai_runs_started_idx" ON "portal_ai_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_ai_tool_calls_run_idx" ON "portal_ai_tool_calls" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_ai_tool_calls_institution_idx" ON "portal_ai_tool_calls" USING btree ("institution_id");