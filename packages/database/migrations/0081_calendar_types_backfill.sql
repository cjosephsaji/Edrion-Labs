-- Seed system calendar event types and map legacy calendar_events.type → event_type_id.

DO $$
DECLARE
  inst record;
BEGIN
  FOR inst IN SELECT "id" FROM "institutions" LOOP
    INSERT INTO "calendar_event_types" ("institution_id", "key", "label", "color", "icon", "is_system", "sort_order")
    VALUES
      (inst."id", 'holiday', 'Holiday', 'red', 'PalmTree', true, 0),
      (inst."id", 'event', 'Event', 'green', 'Calendar', true, 1),
      (inst."id", 'exam_period', 'Exam period', 'amber', 'FileText', true, 2),
      (inst."id", 'activity', 'Activity', 'blue', 'Sparkles', true, 3),
      (inst."id", 'ptm', 'Parent-teacher meeting', 'purple', 'Users', true, 4),
      (inst."id", 'deadline', 'Deadline', 'orange', 'AlarmClock', true, 5)
    ON CONFLICT ("institution_id", "key") DO NOTHING;
  END LOOP;

  UPDATE "calendar_events" AS ce
  SET "event_type_id" = cet."id"
  FROM "calendar_event_types" AS cet
  WHERE cet."institution_id" = ce."institution_id"
    AND cet."key" = COALESCE(NULLIF(ce."type", ''), 'event')
    AND ce."event_type_id" IS NULL;

  -- Fallback: any still-untyped row → 'event'
  UPDATE "calendar_events" AS ce
  SET "event_type_id" = cet."id"
  FROM "calendar_event_types" AS cet
  WHERE cet."institution_id" = ce."institution_id"
    AND cet."key" = 'event'
    AND ce."event_type_id" IS NULL;

  RAISE NOTICE 'calendar_types_backfill: done';
END $$;
