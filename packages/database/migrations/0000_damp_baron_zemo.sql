CREATE TYPE "public"."account_status" AS ENUM('invited', 'active', 'disabled', 'locked', 'pending_deletion');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('platform_employee', 'institution_user', 'independent_user', 'system', 'ai');--> statement-breakpoint
CREATE TYPE "public"."ai_action_status" AS ENUM('proposed', 'awaiting_confirmation', 'confirmed', 'executed', 'rejected', 'expired', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ai_mode" AS ENUM('disabled', 'read_only', 'draft_only', 'full');--> statement-breakpoint
CREATE TYPE "public"."audit_result" AS ENUM('success', 'failure', 'denied');--> statement-breakpoint
CREATE TYPE "public"."billing_cycle" AS ENUM('monthly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."campus_billing_status" AS ENUM('included', 'paid_addon', 'trial', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('USD', 'INR', 'EUR', 'GBP', 'AED');--> statement-breakpoint
CREATE TYPE "public"."institution_status" AS ENUM('lead', 'onboarding', 'trial', 'active', 'past_due', 'restricted', 'suspended', 'cancelled', 'archived');--> statement-breakpoint
CREATE TYPE "public"."institution_type" AS ENUM('school', 'college', 'university', 'training_center');--> statement-breakpoint
CREATE TYPE "public"."onboarding_status" AS ENUM('not_started', 'in_progress', 'awaiting_customer', 'completed');--> statement-breakpoint
CREATE TYPE "public"."plan_audience" AS ENUM('institution', 'independent');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'active', 'past_due', 'grace', 'paused', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."support_access_session_status" AS ENUM('requested', 'approved', 'active', 'ended', 'expired');--> statement-breakpoint
CREATE TYPE "public"."support_case_status" AS ENUM('open', 'pending', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."support_tier" AS ENUM('standard', 'priority', 'enterprise');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employee_permission_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"permission_key" text NOT NULL,
	"granted" boolean NOT NULL,
	"reason" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employee_role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"title" text,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"mfa_enrolled" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"last_auth_at" timestamp with time zone,
	"avatar_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_employees_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "platform_employees_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_permissions" (
	"key" text PRIMARY KEY NOT NULL,
	"group" text NOT NULL,
	"description" text NOT NULL,
	"sensitive" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text NOT NULL,
	"type" "institution_type" NOT NULL,
	"logo_url" text,
	"country" text NOT NULL,
	"region" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"data_region" text DEFAULT 'default' NOT NULL,
	"address" jsonb,
	"primary_contact" jsonb NOT NULL,
	"billing_contact" jsonb,
	"technical_contact" jsonb,
	"status" "institution_status" DEFAULT 'lead' NOT NULL,
	"onboarding_status" "onboarding_status" DEFAULT 'not_started' NOT NULL,
	"support_tier" "support_tier" DEFAULT 'standard' NOT NULL,
	"customer_success_owner_id" uuid,
	"activated_at" timestamp with time zone,
	"trial_starts_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"suspension_reason" text,
	"risk_flags" jsonb DEFAULT '[]'::jsonb,
	"usage_stats" jsonb DEFAULT '{}'::jsonb,
	"internal_notes" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutions_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address" jsonb,
	"contact" jsonb,
	"timezone_override" text,
	"academic_config" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"opening_date" timestamp with time zone,
	"student_capacity" integer,
	"current_user_count" integer DEFAULT 0 NOT NULL,
	"billing_status" "campus_billing_status" DEFAULT 'included' NOT NULL,
	"addon_price_minor" integer,
	"custom_discount_bps" integer,
	"effective_billing_date" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campus_user_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_user_id" uuid NOT NULL,
	"campus_id" uuid NOT NULL,
	"access_level" text DEFAULT 'manage' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "independent_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"country" text,
	"signup_source" text,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"last_activity_at" timestamp with time zone,
	"ai_usage_limit" integer,
	"risk_flags" jsonb DEFAULT '[]'::jsonb,
	"profile" jsonb DEFAULT '{}'::jsonb,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "independent_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "institution_user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_user_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "institution_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"auth_user_id" uuid,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"status" "account_status" DEFAULT 'invited' NOT NULL,
	"invited_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"mfa_enrolled" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"monthly_price_minor" integer DEFAULT 0 NOT NULL,
	"annual_price_minor" integer DEFAULT 0 NOT NULL,
	"base_campus_allowance" integer DEFAULT 1 NOT NULL,
	"per_campus_price_minor" integer DEFAULT 0 NOT NULL,
	"usage_limits" jsonb DEFAULT '{}'::jsonb,
	"feature_entitlements" jsonb DEFAULT '{}'::jsonb,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"support_tier" text DEFAULT 'standard' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"audience" "plan_audience" DEFAULT 'institution' NOT NULL,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"kind" text DEFAULT 'campus' NOT NULL,
	"campus_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_minor" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"effective_date" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid,
	"independent_user_id" uuid,
	"plan_version_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'trial' NOT NULL,
	"billing_cycle" "billing_cycle" DEFAULT 'monthly' NOT NULL,
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"override_price_minor" integer,
	"institution_per_campus_price_minor" integer,
	"period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"cancel_at" timestamp with time zone,
	"grace_period_ends_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"category" text NOT NULL,
	"actor_name" text,
	"summary" text NOT NULL,
	"institution_id" uuid,
	"entity_type" text,
	"entity_id" text,
	"risk_level" "risk_level" DEFAULT 'low' NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"actor_name" text,
	"actor_role" text,
	"institution_id" uuid,
	"institution_name" text,
	"campus_id" uuid,
	"support_session_id" uuid,
	"case_ref" text,
	"action" text NOT NULL,
	"module" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"previous_state" jsonb,
	"new_state" jsonb,
	"reason" text,
	"result" "audit_result" DEFAULT 'success' NOT NULL,
	"risk_level" "risk_level" DEFAULT 'low' NOT NULL,
	"error_detail" text,
	"ip" text,
	"user_agent" text,
	"request_id" text,
	"correlation_id" text,
	"api_endpoint" text,
	"ai_involved" boolean DEFAULT false NOT NULL,
	"ai_run_id" uuid,
	"confirmation" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "security_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"institution_id" uuid,
	"risk_level" "risk_level" DEFAULT 'low' NOT NULL,
	"ip" text,
	"user_agent" text,
	"detail" jsonb,
	"flagged" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_access_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"employee_name" text NOT NULL,
	"employee_role" text,
	"access_level" text DEFAULT 'support' NOT NULL,
	"reason" text NOT NULL,
	"case_ref" text,
	"campus_id" uuid,
	"status" "support_access_session_status" DEFAULT 'requested' NOT NULL,
	"risk_level" "risk_level" DEFAULT 'medium' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"institution_id" uuid,
	"independent_user_id" uuid,
	"subject" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" "support_case_status" DEFAULT 'open' NOT NULL,
	"assigned_employee_id" uuid,
	"sla_due_at" timestamp with time zone,
	"resolution" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_cases_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"author_type" text NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"internal" jsonb DEFAULT '{"note":false}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_permission_overrides" ADD CONSTRAINT "employee_permission_overrides_employee_id_platform_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."platform_employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_role_assignments" ADD CONSTRAINT "employee_role_assignments_employee_id_platform_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."platform_employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_role_assignments" ADD CONSTRAINT "employee_role_assignments_role_id_platform_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."platform_roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_role_permissions" ADD CONSTRAINT "platform_role_permissions_role_id_platform_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."platform_roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_role_permissions" ADD CONSTRAINT "platform_role_permissions_permission_key_platform_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."platform_permissions"("key") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "institutions" ADD CONSTRAINT "institutions_customer_success_owner_id_platform_employees_id_fk" FOREIGN KEY ("customer_success_owner_id") REFERENCES "public"."platform_employees"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campuses" ADD CONSTRAINT "campuses_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campus_user_access" ADD CONSTRAINT "campus_user_access_institution_user_id_institution_users_id_fk" FOREIGN KEY ("institution_user_id") REFERENCES "public"."institution_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campus_user_access" ADD CONSTRAINT "campus_user_access_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "institution_user_roles" ADD CONSTRAINT "institution_user_roles_institution_user_id_institution_users_id_fk" FOREIGN KEY ("institution_user_id") REFERENCES "public"."institution_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "institution_users" ADD CONSTRAINT "institution_users_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_addons" ADD CONSTRAINT "subscription_addons_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_version_id_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_access_sessions" ADD CONSTRAINT "support_access_sessions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_access_sessions" ADD CONSTRAINT "support_access_sessions_employee_id_platform_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."platform_employees"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_assigned_employee_id_platform_employees_id_fk" FOREIGN KEY ("assigned_employee_id") REFERENCES "public"."platform_employees"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_case_id_support_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."support_cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_override_employee_idx" ON "employee_permission_overrides" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_role_uniq" ON "employee_role_assignments" USING btree ("employee_id","role_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_role_employee_idx" ON "employee_role_assignments" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employees_email_idx" ON "platform_employees" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employees_status_idx" ON "platform_employees" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "role_permission_uniq" ON "platform_role_permissions" USING btree ("role_id","permission_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "institutions_status_idx" ON "institutions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "institutions_type_idx" ON "institutions" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "institutions_country_idx" ON "institutions" USING btree ("country");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "institutions_owner_idx" ON "institutions" USING btree ("customer_success_owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "institutions_display_idx" ON "institutions" USING btree ("display_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campuses_institution_idx" ON "campuses" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campuses_institution_code_uniq" ON "campuses" USING btree ("institution_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campuses_billing_status_idx" ON "campuses" USING btree ("billing_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campus_access_user_idx" ON "campus_user_access" USING btree ("institution_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campus_access_campus_idx" ON "campus_user_access" USING btree ("campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campus_access_uniq" ON "campus_user_access" USING btree ("institution_user_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "independent_users_status_idx" ON "independent_users" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "independent_users_email_idx" ON "independent_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "institution_users_institution_idx" ON "institution_users" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "institution_users_inst_email_uniq" ON "institution_users" USING btree ("institution_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "institution_users_status_idx" ON "institution_users" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_versions_plan_idx" ON "plan_versions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_versions_uniq" ON "plan_versions" USING btree ("plan_id","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_institution_idx" ON "subscriptions" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_occurred_idx" ON "activity_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_category_idx" ON "activity_events" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_occurred_idx" ON "audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_actor_idx" ON "audit_events" USING btree ("actor_type","actor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_institution_idx" ON "audit_events" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_module_idx" ON "audit_events" USING btree ("module");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_session_idx" ON "audit_events" USING btree ("support_session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_correlation_idx" ON "audit_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_occurred_idx" ON "security_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_type_idx" ON "security_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_actor_idx" ON "security_events" USING btree ("actor_type","actor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_sessions_institution_idx" ON "support_access_sessions" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_sessions_employee_idx" ON "support_access_sessions" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_sessions_status_idx" ON "support_access_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_sessions_expires_idx" ON "support_access_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_cases_status_idx" ON "support_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_cases_institution_idx" ON "support_cases" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_cases_assignee_idx" ON "support_cases" USING btree ("assigned_employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_messages_case_idx" ON "support_messages" USING btree ("case_id");