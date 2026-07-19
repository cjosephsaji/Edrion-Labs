-- Strip bell schedules: timetable slots own period times; attendance keys off slot_id.

ALTER TABLE "timetable_slots" ADD COLUMN IF NOT EXISTS "label" text;
--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'teaching' NOT NULL;
--> statement-breakpoint
ALTER TABLE "timetable_slots" DROP CONSTRAINT IF EXISTS "timetable_slots_period_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "timetable_slots_period_idx";
--> statement-breakpoint
ALTER TABLE "timetable_slots" DROP COLUMN IF EXISTS "period_id";
--> statement-breakpoint

ALTER TABLE "attendance_sessions" ADD COLUMN IF NOT EXISTS "slot_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_slot_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."timetable_slots"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_sessions_slot_idx" ON "attendance_sessions" ("slot_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_session_slot_id_uniq"
  ON "attendance_sessions" ("class_id","date","slot_id")
  WHERE "slot_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" DROP CONSTRAINT IF EXISTS "attendance_sessions_period_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "attendance_sessions_period_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "attendance_session_period_id_uniq";
--> statement-breakpoint
ALTER TABLE "attendance_sessions" DROP COLUMN IF EXISTS "period_id";
--> statement-breakpoint

ALTER TABLE "classes" DROP CONSTRAINT IF EXISTS "classes_bell_schedule_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "classes_bell_schedule_idx";
--> statement-breakpoint
ALTER TABLE "classes" DROP COLUMN IF EXISTS "bell_schedule_id";
--> statement-breakpoint

DROP TABLE IF EXISTS "bell_periods";
--> statement-breakpoint
DROP TABLE IF EXISTS "bell_schedules";
--> statement-breakpoint
DROP TABLE IF EXISTS "bell_period_types";
