CREATE TYPE "public"."ai_action_rule_effect" AS ENUM('allow', 'require_confirmation', 'require_second_approver', 'block');--> statement-breakpoint
CREATE TYPE "public"."ai_capability" AS ENUM('search', 'analysis', 'recommendations', 'report', 'drafting', 'record_create', 'record_edit', 'billing', 'user', 'permission', 'institution_access', 'feature', 'communications');--> statement-breakpoint
CREATE TYPE "public"."ai_guardrail_decision" AS ENUM('allow', 'needs_confirmation', 'needs_second_approver', 'blocked');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_action_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capability" "ai_capability" NOT NULL,
	"action" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"effect" "ai_action_rule_effect" DEFAULT 'require_confirmation' NOT NULL,
	"risk_level" text,
	"description" text,
	"reason" text,
	"set_by_name" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "feature_scope" NOT NULL,
	"scope_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"mode" "ai_mode" DEFAULT 'disabled' NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb,
	"max_financial_impact_minor" integer,
	"max_affected_users" integer,
	"two_person_threshold_minor" integer,
	"second_approver_capabilities" jsonb DEFAULT '[]'::jsonb,
	"kill_switch" boolean DEFAULT false NOT NULL,
	"reason" text,
	"set_by_name" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_action_rules_capability_idx" ON "ai_action_rules" USING btree ("capability","action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_policies_scope_idx" ON "ai_policies" USING btree ("scope","scope_id");