-- Plan 01: append-only learning events ledger.

CREATE TABLE IF NOT EXISTS "learning_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"institution_id" uuid,
	"campus_id" uuid,
	"student_id" uuid,
	"independent_user_id" uuid,
	"actor_kind" text DEFAULT 'student' NOT NULL,
	"actor_id" uuid,
	"event_type" text NOT NULL,
	"topic_key" text,
	"subject_label" text,
	"context_type" text,
	"context_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text,
	CONSTRAINT "learning_events_subject_ck" CHECK (
		("student_id" IS NOT NULL AND "independent_user_id" IS NULL AND "institution_id" IS NOT NULL)
		OR ("student_id" IS NULL AND "independent_user_id" IS NOT NULL AND "institution_id" IS NULL)
	)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_campus_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_independent_user_id_fk" FOREIGN KEY ("independent_user_id") REFERENCES "public"."independent_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_events_student_time_idx" ON "learning_events" ("student_id","occurred_at" DESC) WHERE "student_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_events_indep_time_idx" ON "learning_events" ("independent_user_id","occurred_at" DESC) WHERE "independent_user_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_events_type_time_idx" ON "learning_events" ("event_type","occurred_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_events_topic_idx" ON "learning_events" ("topic_key") WHERE "topic_key" IS NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION learning_events_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'learning_events is append-only'; END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS learning_events_no_update ON learning_events;
--> statement-breakpoint
CREATE TRIGGER learning_events_no_update BEFORE UPDATE OR DELETE ON learning_events
  FOR EACH ROW EXECUTE FUNCTION learning_events_immutable();
