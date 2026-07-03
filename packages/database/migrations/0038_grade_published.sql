-- Parent-portal results publish gate: grades are visible to guardians only when published.
ALTER TABLE "grade_entries" ADD COLUMN IF NOT EXISTS "published" boolean DEFAULT false NOT NULL;
