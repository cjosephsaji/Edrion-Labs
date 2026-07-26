-- Seed default period types + "Default" bell schedule per institution, then link timetable slots.

DO $$
DECLARE
  inst record;
  sched_id uuid;
  type_class uuid;
  type_break uuid;
  type_lunch uuid;
BEGIN
  FOR inst IN SELECT "id" FROM "institutions" LOOP
    INSERT INTO "bell_period_types" ("institution_id", "key", "label", "layout", "sort_order", "is_system")
    VALUES
      (inst."id", 'class', 'Class period', 'grid', 0, true),
      (inst."id", 'break', 'Break', 'span', 1, true),
      (inst."id", 'lunch', 'Lunch', 'span', 2, true)
    ON CONFLICT ("institution_id", "key") DO NOTHING;

    SELECT "id" INTO type_class FROM "bell_period_types"
      WHERE "institution_id" = inst."id" AND "key" = 'class' LIMIT 1;
    SELECT "id" INTO type_break FROM "bell_period_types"
      WHERE "institution_id" = inst."id" AND "key" = 'break' LIMIT 1;
    SELECT "id" INTO type_lunch FROM "bell_period_types"
      WHERE "institution_id" = inst."id" AND "key" = 'lunch' LIMIT 1;

    INSERT INTO "bell_schedules" ("institution_id", "name", "days_of_week", "is_default")
    VALUES (inst."id", 'Default', ARRAY[1,2,3,4,5]::smallint[], true)
    ON CONFLICT ("institution_id", "name") DO NOTHING;

    SELECT "id" INTO sched_id FROM "bell_schedules"
      WHERE "institution_id" = inst."id" AND "name" = 'Default' LIMIT 1;

    IF sched_id IS NOT NULL AND type_class IS NOT NULL THEN
      INSERT INTO "bell_periods" ("institution_id", "schedule_id", "period_type_id", "start_time", "end_time", "sort_order")
      VALUES
        (inst."id", sched_id, type_class, '08:00', '08:45', 0),
        (inst."id", sched_id, type_class, '08:50', '09:35', 1),
        (inst."id", sched_id, type_class, '09:45', '10:30', 2),
        (inst."id", sched_id, type_break, '10:30', '11:00', 3),
        (inst."id", sched_id, type_class, '11:00', '11:45', 4),
        (inst."id", sched_id, type_class, '11:50', '12:35', 5),
        (inst."id", sched_id, type_lunch, '12:35', '13:15', 6),
        (inst."id", sched_id, type_class, '13:15', '14:00', 7),
        (inst."id", sched_id, type_class, '14:00', '14:45', 8),
        (inst."id", sched_id, type_class, '14:50', '15:35', 9)
      ON CONFLICT ("schedule_id", "start_time") DO NOTHING;
    END IF;
  END LOOP;

  -- Link timetable slots to matching bell periods by start_time within the institution.
  UPDATE "timetable_slots" AS ts
  SET "period_id" = bp."id"
  FROM "bell_periods" AS bp
  INNER JOIN "bell_schedules" AS bs ON bs."id" = bp."schedule_id"
  WHERE ts."period_id" IS NULL
    AND bp."institution_id" = ts."institution_id"
    AND bp."start_time" = ts."start_time"
    AND bs."is_default" = true;

  RAISE NOTICE 'bell_schedule_backfill: done';
END $$;
