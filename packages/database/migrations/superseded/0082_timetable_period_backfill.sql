-- Link existing timetable slots to bell periods via each class's schedule (or institution default).

UPDATE "timetable_slots" AS ts
SET "period_id" = bp."id"
FROM "classes" AS c
INNER JOIN "bell_schedules" AS bs ON bs."id" = COALESCE(
  c."bell_schedule_id",
  (
    SELECT bs2."id"
    FROM "bell_schedules" AS bs2
    WHERE bs2."institution_id" = c."institution_id"
      AND bs2."is_default" = true
    LIMIT 1
  )
)
INNER JOIN "bell_periods" AS bp
  ON bp."schedule_id" = bs."id"
 AND bp."start_time" = ts."start_time"
INNER JOIN "bell_period_types" AS bpt
  ON bpt."id" = bp."period_type_id"
 AND bpt."layout" = 'grid'
WHERE ts."period_id" IS NULL
  AND c."id" = ts."class_id";
