-- Minimal marks-release substrate for report-card binding (Tier 1 Marks not fully landed).
-- Report cards MUST intersect mark_release_batches.entry_ids with grade_entries.published=true.

CREATE TABLE IF NOT EXISTS "mark_release_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL REFERENCES "institutions"("id") ON DELETE cascade,
  "campus_id" uuid REFERENCES "campuses"("id") ON DELETE set null,
  "term_id" uuid,
  "scope" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "scope_hash" text,
  "entry_ids" uuid[] NOT NULL DEFAULT '{}',
  "status" text NOT NULL DEFAULT 'released',
  "released_at" timestamptz,
  "retracted_at" timestamptz,
  "created_by" uuid,
  "version" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "mark_release_batches_status_ck" CHECK (
    "status" IN ('draft', 'releasing', 'released', 'retracted')
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mark_release_batches_institution_idx"
  ON "mark_release_batches" ("institution_id", "released_at" DESC);
CREATE INDEX IF NOT EXISTS "mark_release_batches_term_idx"
  ON "mark_release_batches" ("term_id")
  WHERE "term_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "mark_release_batches_active_scope_uniq"
  ON "mark_release_batches" ("institution_id", "scope_hash")
  WHERE "status" = 'released' AND "retracted_at" IS NULL AND "scope_hash" IS NOT NULL;
