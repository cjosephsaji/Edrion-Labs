ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "is_lab_subject" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_schedules" ADD COLUMN IF NOT EXISTS "timetable_slot_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lab_schedules" ADD CONSTRAINT "lab_schedules_timetable_slot_id_timetable_slots_id_fk" FOREIGN KEY ("timetable_slot_id") REFERENCES "public"."timetable_slots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lab_schedules_timetable_slot_id_uniq" ON "lab_schedules" USING btree ("timetable_slot_id");
