-- Link legacy curriculum rows to their programme term slot so semester placement is unambiguous.
UPDATE "programme_subjects" AS ps
SET "slot_id" = pts."id"
FROM "programme_term_slots" AS pts
WHERE ps."slot_id" IS NULL
  AND ps."programme_level_id" = pts."programme_level_id"
  AND ps."semester_sequence" = pts."sequence_in_year";
