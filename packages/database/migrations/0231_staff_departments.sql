-- Academic course/stream roots and organisational staff departments are independent units.
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "unit_kind" text NOT NULL DEFAULT 'department';
--> statement-breakpoint
UPDATE "departments" AS d SET "unit_kind" = 'programme', "version" = d."version" + 1
WHERE d."unit_kind" = 'department' AND (
  EXISTS (SELECT 1 FROM "department_grade_levels" l WHERE l."department_id" = d."id")
  OR EXISTS (SELECT 1 FROM "programme_term_slots" s WHERE s."department_id" = d."id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "departments_institution_unit_kind_idx" ON "departments" ("institution_id", "unit_kind");
