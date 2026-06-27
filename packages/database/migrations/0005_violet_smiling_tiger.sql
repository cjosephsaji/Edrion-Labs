CREATE TYPE "public"."feature_definition_status" AS ENUM('active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."feature_release_stage" AS ENUM('internal', 'alpha', 'beta', 'ga', 'deprecated');--> statement-breakpoint
CREATE TYPE "public"."feature_rollout_type" AS ENUM('percentage', 'allow_list', 'block_list', 'environment', 'schedule', 'kill_switch');--> statement-breakpoint
CREATE TYPE "public"."feature_scope" AS ENUM('global', 'plan', 'institution', 'campus', 'independent_user', 'institution_user', 'employee_role', 'cohort');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feature_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_id" uuid NOT NULL,
	"scope" "feature_scope" NOT NULL,
	"scope_id" text,
	"value" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"activates_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"reason" text,
	"set_by_name" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feature_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"module" text NOT NULL,
	"status" "feature_definition_status" DEFAULT 'active' NOT NULL,
	"default_value" boolean DEFAULT false NOT NULL,
	"available_scopes" jsonb DEFAULT '[]'::jsonb,
	"dependencies" jsonb DEFAULT '[]'::jsonb,
	"release_stage" "feature_release_stage" DEFAULT 'internal' NOT NULL,
	"owner" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_definitions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feature_rollouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_id" uuid NOT NULL,
	"type" "feature_rollout_type" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"percentage" integer,
	"allow_list" jsonb DEFAULT '[]'::jsonb,
	"block_list" jsonb DEFAULT '[]'::jsonb,
	"environments" jsonb DEFAULT '[]'::jsonb,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"reason" text,
	"set_by_name" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feature_assignments" ADD CONSTRAINT "feature_assignments_feature_id_feature_definitions_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."feature_definitions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feature_rollouts" ADD CONSTRAINT "feature_rollouts_feature_id_feature_definitions_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."feature_definitions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_assignments_feature_idx" ON "feature_assignments" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_assignments_scope_idx" ON "feature_assignments" USING btree ("scope","scope_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_definitions_key_idx" ON "feature_definitions" USING btree ("key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_definitions_module_idx" ON "feature_definitions" USING btree ("module");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_definitions_status_idx" ON "feature_definitions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_rollouts_feature_idx" ON "feature_rollouts" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_rollouts_type_idx" ON "feature_rollouts" USING btree ("type");