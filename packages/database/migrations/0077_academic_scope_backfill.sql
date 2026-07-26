-- Idempotent backfill of enrollment history + year/term stamps.
-- Skip cases are logged via RAISE NOTICE (no current year; grade_entries with neither exam nor class).

DO $$
DECLARE
  skipped_students_no_year int := 0;
  skipped_staff_no_year int := 0;
  skipped_grades_no_path int := 0;
BEGIN
  -- Students with a class → enrollment from the class's year/term.
  INSERT INTO "student_enrollments" (
    "institution_id", "campus_id", "student_id", "academic_year_id", "term_id",
    "programme_level_id", "grade_level_id", "class_id", "roll_no", "status", "enrolled_on"
  )
  SELECT
    s."institution_id",
    s."campus_id",
    s."id",
    c."academic_year_id",
    c."term_id",
    c."programme_level_id",
    COALESCE(s."grade_level_id", c."grade_level_id"),
    s."class_id",
    s."roll_no",
    'active',
    s."enrollment_date"
  FROM "students" AS s
  INNER JOIN "classes" AS c ON c."id" = s."class_id"
  ON CONFLICT DO NOTHING;

  -- Students without a class → institution's current year (whole-year row).
  INSERT INTO "student_enrollments" (
    "institution_id", "campus_id", "student_id", "academic_year_id", "term_id",
    "grade_level_id", "status", "enrolled_on"
  )
  SELECT
    s."institution_id",
    s."campus_id",
    s."id",
    y."id",
    NULL,
    s."grade_level_id",
    'active',
    s."enrollment_date"
  FROM "students" AS s
  INNER JOIN LATERAL (
    SELECT ay."id"
    FROM "academic_years" AS ay
    WHERE ay."institution_id" = s."institution_id"
      AND ay."is_current" = true
      AND (ay."campus_id" IS NULL OR ay."campus_id" = s."campus_id")
    ORDER BY ay."campus_id" NULLS LAST
    LIMIT 1
  ) AS y ON true
  WHERE s."class_id" IS NULL
  ON CONFLICT DO NOTHING;

  SELECT count(*)::int INTO skipped_students_no_year
  FROM "students" AS s
  WHERE NOT EXISTS (
      SELECT 1 FROM "student_enrollments" AS e WHERE e."student_id" = s."id"
    );
  RAISE NOTICE 'academic_scope_backfill: skipped_students_no_year=%', skipped_students_no_year;

  -- Staff from class teachers + class_subject_teachers + active staff → current year.
  INSERT INTO "staff_assignments" (
    "institution_id", "campus_id", "staff_id", "academic_year_id", "term_id",
    "department_id", "designation", "employment_type", "status", "started_on"
  )
  SELECT DISTINCT ON (src."staff_id", src."academic_year_id", src."term_id")
    src."institution_id",
    src."campus_id",
    src."staff_id",
    src."academic_year_id",
    src."term_id",
    src."department_id",
    src."designation",
    src."employment_type",
    'active',
    src."started_on"
  FROM (
    SELECT
      st."institution_id",
      st."campus_id",
      st."id" AS staff_id,
      c."academic_year_id",
      c."term_id",
      st."department_id",
      st."designation",
      st."employment_type",
      st."join_date" AS started_on
    FROM "staff" AS st
    INNER JOIN "classes" AS c ON c."class_teacher_id" = st."id"

    UNION ALL

    SELECT
      st."institution_id",
      st."campus_id",
      st."id",
      c."academic_year_id",
      c."term_id",
      st."department_id",
      st."designation",
      st."employment_type",
      st."join_date"
    FROM "staff" AS st
    INNER JOIN "class_subject_teachers" AS cst ON cst."teacher_id" = st."id"
    INNER JOIN "classes" AS c ON c."id" = cst."class_id"

    UNION ALL

    SELECT
      st."institution_id",
      st."campus_id",
      st."id",
      y."id",
      NULL::uuid,
      st."department_id",
      st."designation",
      st."employment_type",
      st."join_date"
    FROM "staff" AS st
    INNER JOIN LATERAL (
      SELECT ay."id"
      FROM "academic_years" AS ay
      WHERE ay."institution_id" = st."institution_id"
        AND ay."is_current" = true
        AND (ay."campus_id" IS NULL OR ay."campus_id" = st."campus_id")
      ORDER BY ay."campus_id" NULLS LAST
      LIMIT 1
    ) AS y ON true
    WHERE st."status" = 'active'
  ) AS src
  ORDER BY src."staff_id", src."academic_year_id", src."term_id"
  ON CONFLICT DO NOTHING;

  SELECT count(*)::int INTO skipped_staff_no_year
  FROM "staff" AS st
  WHERE st."status" = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM "staff_assignments" AS a WHERE a."staff_id" = st."id"
    );
  RAISE NOTICE 'academic_scope_backfill: skipped_staff_no_year=%', skipped_staff_no_year;

  -- Denormalised stamps: grade_entries from exam / class / current year.
  UPDATE "grade_entries" AS g
  SET
    "academic_year_id" = COALESCE(
      g."academic_year_id",
      (SELECT e."academic_year_id" FROM "exams" AS e WHERE e."id" = g."exam_id"),
      (SELECT c."academic_year_id" FROM "classes" AS c WHERE c."id" = g."class_id"),
      (SELECT ay."id" FROM "academic_years" AS ay
       WHERE ay."institution_id" = g."institution_id" AND ay."is_current" = true
       ORDER BY ay."campus_id" NULLS LAST LIMIT 1)
    ),
    "term_id" = COALESCE(
      g."term_id",
      (SELECT e."term_id" FROM "exams" AS e WHERE e."id" = g."exam_id"),
      (SELECT c."term_id" FROM "classes" AS c WHERE c."id" = g."class_id")
    )
  WHERE g."academic_year_id" IS NULL;

  SELECT count(*)::int INTO skipped_grades_no_path
  FROM "grade_entries" AS g
  WHERE g."academic_year_id" IS NULL;
  RAISE NOTICE 'academic_scope_backfill: skipped_grades_no_path=%', skipped_grades_no_path;

  -- Assignments from class.
  UPDATE "assignments" AS a
  SET
    "academic_year_id" = c."academic_year_id",
    "term_id" = COALESCE(a."term_id", c."term_id")
  FROM "classes" AS c
  WHERE a."class_id" = c."id"
    AND a."academic_year_id" IS NULL;

  -- Attendance sessions from class.
  UPDATE "attendance_sessions" AS s
  SET
    "academic_year_id" = c."academic_year_id",
    "term_id" = COALESCE(s."term_id", c."term_id")
  FROM "classes" AS c
  WHERE s."class_id" = c."id"
    AND s."academic_year_id" IS NULL;

  -- Fee invoices from structure, else current year.
  UPDATE "fee_invoices" AS fi
  SET
    "academic_year_id" = COALESCE(
      fi."academic_year_id",
      (SELECT fs."academic_year_id" FROM "fee_structures" AS fs WHERE fs."id" = fi."fee_structure_id"),
      (SELECT ay."id" FROM "academic_years" AS ay
       WHERE ay."institution_id" = fi."institution_id" AND ay."is_current" = true
       ORDER BY ay."campus_id" NULLS LAST LIMIT 1)
    ),
    "term_id" = COALESCE(
      fi."term_id",
      (SELECT fs."term_id" FROM "fee_structures" AS fs WHERE fs."id" = fi."fee_structure_id")
    )
  WHERE fi."academic_year_id" IS NULL;
END $$;
