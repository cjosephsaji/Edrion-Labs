CREATE TABLE IF NOT EXISTS "ai_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"approver_id" uuid NOT NULL,
	"approver_name" text,
	"approved" boolean DEFAULT true NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"employee_name" text,
	"method" text DEFAULT 'typed' NOT NULL,
	"confirmation_text" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"employee_name" text,
	"prompt" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb,
	"context_sources" jsonb DEFAULT '[]'::jsonb,
	"status" "ai_action_status" DEFAULT 'proposed' NOT NULL,
	"summary" text,
	"model" text DEFAULT 'stub-planner' NOT NULL,
	"prompt_version" text,
	"risk_level" text,
	"input_tokens" integer,
	"output_tokens" integer,
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
CREATE TABLE IF NOT EXISTS "ai_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
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
 ALTER TABLE "ai_approvals" ADD CONSTRAINT "ai_approvals_run_id_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_confirmations" ADD CONSTRAINT "ai_confirmations_run_id_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_run_id_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_approvals_run_idx" ON "ai_approvals" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_confirmations_run_idx" ON "ai_confirmations" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_runs_employee_idx" ON "ai_runs" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_runs_status_idx" ON "ai_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_runs_started_idx" ON "ai_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_tool_calls_run_idx" ON "ai_tool_calls" USING btree ("run_id");