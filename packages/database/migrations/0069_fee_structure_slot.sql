-- Department-agnostic placement for fee structures.
--
-- A college-wide charge ("Year 1, Semester 1 tuition — every programme") cannot be expressed with
-- grade_level_id / term_id: in a university each department owns its own "Year 1" and "Semester 1"
-- row, so pointing at one bills exactly one department. These columns store the *numbers* those
-- rows share (grade_levels.level, academic_terms.sequence), which is the only handle that crosses
-- departments. NULL = not scoped that way; existing rows keep using the id columns.
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "grade_level_number" integer;
--> statement-breakpoint
ALTER TABLE "fee_structures" ADD COLUMN IF NOT EXISTS "term_sequence" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_structures_slot_idx"
  ON "fee_structures" ("institution_id", "grade_level_number", "term_sequence");
