ALTER TABLE "institution_users" ADD COLUMN "phone_e164" text;--> statement-breakpoint
ALTER TABLE "institution_users" ADD COLUMN "phone_country_code" text;--> statement-breakpoint
ALTER TABLE "institution_registration_requests" ADD COLUMN "administrative_division_code" text;--> statement-breakpoint
ALTER TABLE "institution_registration_requests" ADD COLUMN "contact_phone_e164" text;--> statement-breakpoint
-- Defense-in-depth: the standardized phone companions must be NULL or valid E.164.
-- Existing rows are NULL until backfilled, so these constraints add cleanly.
ALTER TABLE "institution_users"
  ADD CONSTRAINT "institution_users_phone_e164_check"
  CHECK ("phone_e164" IS NULL OR "phone_e164" ~ '^\+[1-9][0-9]{1,14}$');--> statement-breakpoint
ALTER TABLE "institution_registration_requests"
  ADD CONSTRAINT "institution_registration_requests_contact_phone_e164_check"
  CHECK ("contact_phone_e164" IS NULL OR "contact_phone_e164" ~ '^\+[1-9][0-9]{1,14}$');
