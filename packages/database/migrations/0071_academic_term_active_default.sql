-- Default new academic terms to active and promote existing planning terms.
ALTER TABLE "academic_terms" ALTER COLUMN "status" SET DEFAULT 'active';
--> statement-breakpoint
UPDATE "academic_terms" SET "status" = 'active' WHERE "status" = 'planning';
