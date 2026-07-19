-- Unify calendar on calendar_events; add event types; date-based columns.

CREATE TABLE IF NOT EXISTS "calendar_event_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"color" text NOT NULL DEFAULT 'green',
	"icon" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calendar_event_types" ADD CONSTRAINT "calendar_event_types_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_event_types_institution_key_uniq" ON "calendar_event_types" ("institution_id","key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_event_types_institution_idx" ON "calendar_event_types" ("institution_id");
--> statement-breakpoint

-- Reshape calendar_events: timestamptz → date, add type FK / status / times / source_ref
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "event_type_id" uuid;
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'published';
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "source_ref" jsonb;
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "start_time" text;
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "end_time" text;
--> statement-breakpoint

-- Convert starts_on / ends_on from timestamptz to date (seed-only table; no production writers).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events' AND column_name = 'starts_on'
      AND data_type = 'timestamp with time zone'
  ) THEN
    ALTER TABLE "calendar_events"
      ALTER COLUMN "starts_on" TYPE date USING (("starts_on" AT TIME ZONE 'UTC')::date);
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events' AND column_name = 'ends_on'
      AND data_type = 'timestamp with time zone'
  ) THEN
    ALTER TABLE "calendar_events"
      ALTER COLUMN "ends_on" TYPE date USING (("ends_on" AT TIME ZONE 'UTC')::date);
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "calendar_events" DROP COLUMN IF EXISTS "all_day";
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_event_type_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."calendar_event_types"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_events_event_type_idx" ON "calendar_events" ("institution_id","event_type_id");
--> statement-breakpoint

-- Overlay query indexes
CREATE INDEX IF NOT EXISTS "assignments_institution_due_idx" ON "assignments" ("institution_id","due_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_schedules_institution_date_idx" ON "exam_schedules" ("institution_id","exam_date");
