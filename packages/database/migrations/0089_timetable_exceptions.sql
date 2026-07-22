-- Timetable exceptions + ICS tokens (Tier 1 Phase 1).

ALTER TABLE "timetable_slots"
  ADD COLUMN IF NOT EXISTS "effective_from" date,
  ADD COLUMN IF NOT EXISTS "effective_to" date;
--> statement-breakpoint

ALTER TABLE "subjects"
  ADD COLUMN IF NOT EXISTS "weekly_periods" integer;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "period_exceptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "campus_id" uuid NOT NULL,
  "slot_id" uuid,
  "class_id" uuid NOT NULL,
  "date" date NOT NULL,
  "recurring" boolean DEFAULT false NOT NULL,
  "recurring_until" date,
  "type" text NOT NULL,
  "new_room" text,
  "new_teacher_id" uuid,
  "subject_id" uuid,
  "start_time" text,
  "end_time" text,
  "note" text,
  "created_by" uuid,
  "revoked_at" timestamp with time zone,
  "revoked_by" uuid,
  "revoked_reason" text,
  "version" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "period_exceptions_type_check"
    CHECK ("type" IN ('cancelled', 'room_change', 'substitution', 'extra_class')),
  CONSTRAINT "period_exceptions_revoked_reason_check"
    CHECK ("revoked_reason" IS NULL OR "revoked_reason" IN ('manual', 'superseded', 'slot_deleted')),
  CONSTRAINT "period_exceptions_note_length_check"
    CHECK ("note" IS NULL OR char_length("note") <= 200)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ics_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "token" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_fetched_at" timestamp with time zone,
  "revoked_at" timestamp with time zone
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "period_exceptions"
    ADD CONSTRAINT "period_exceptions_institution_id_institutions_id_fk"
    FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "period_exceptions"
    ADD CONSTRAINT "period_exceptions_campus_id_campuses_id_fk"
    FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id")
    ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "period_exceptions"
    ADD CONSTRAINT "period_exceptions_slot_id_timetable_slots_id_fk"
    FOREIGN KEY ("slot_id") REFERENCES "public"."timetable_slots"("id")
    ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "period_exceptions"
    ADD CONSTRAINT "period_exceptions_class_id_classes_id_fk"
    FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "period_exceptions"
    ADD CONSTRAINT "period_exceptions_new_teacher_id_staff_id_fk"
    FOREIGN KEY ("new_teacher_id") REFERENCES "public"."staff"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "period_exceptions"
    ADD CONSTRAINT "period_exceptions_subject_id_subjects_id_fk"
    FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "period_exceptions"
    ADD CONSTRAINT "period_exceptions_created_by_institution_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."institution_users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "period_exceptions"
    ADD CONSTRAINT "period_exceptions_revoked_by_institution_users_id_fk"
    FOREIGN KEY ("revoked_by") REFERENCES "public"."institution_users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "ics_tokens"
    ADD CONSTRAINT "ics_tokens_institution_id_institutions_id_fk"
    FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ics_tokens"
    ADD CONSTRAINT "ics_tokens_student_id_students_id_fk"
    FOREIGN KEY ("student_id") REFERENCES "public"."students"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "period_exceptions_institution_class_date_idx"
  ON "period_exceptions" USING btree ("institution_id", "class_id", "date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "period_exceptions_institution_slot_live_idx"
  ON "period_exceptions" USING btree ("institution_id", "slot_id")
  WHERE "revoked_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "period_exceptions_institution_date_live_idx"
  ON "period_exceptions" USING btree ("institution_id", "date")
  WHERE "revoked_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "period_exceptions_institution_teacher_live_idx"
  ON "period_exceptions" USING btree ("institution_id", "new_teacher_id")
  WHERE "revoked_at" IS NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "ics_tokens_token_uniq"
  ON "ics_tokens" USING btree ("token");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ics_tokens_student_active_uniq"
  ON "ics_tokens" USING btree ("student_id")
  WHERE "revoked_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ics_tokens_institution_student_idx"
  ON "ics_tokens" USING btree ("institution_id", "student_id");

--> statement-breakpoint
-- period_exceptions: no DELETE; UPDATE limited to revocation/truncation fields.
REVOKE DELETE ON period_exceptions FROM edrion_app;
REVOKE UPDATE ON period_exceptions FROM edrion_app;
GRANT SELECT, INSERT ON period_exceptions TO edrion_app;
GRANT UPDATE (revoked_at, revoked_by, revoked_reason, recurring_until, version, updated_at)
  ON period_exceptions TO edrion_app;

CREATE OR REPLACE FUNCTION edrion_period_exceptions_guard_update() RETURNS trigger AS $$
BEGIN
  IF OLD.institution_id IS DISTINCT FROM NEW.institution_id
     OR OLD.campus_id IS DISTINCT FROM NEW.campus_id
     OR OLD.slot_id IS DISTINCT FROM NEW.slot_id
     OR OLD.class_id IS DISTINCT FROM NEW.class_id
     OR OLD.date IS DISTINCT FROM NEW.date
     OR OLD.recurring IS DISTINCT FROM NEW.recurring
     OR OLD.type IS DISTINCT FROM NEW.type
     OR OLD.new_room IS DISTINCT FROM NEW.new_room
     OR OLD.new_teacher_id IS DISTINCT FROM NEW.new_teacher_id
     OR OLD.subject_id IS DISTINCT FROM NEW.subject_id
     OR OLD.start_time IS DISTINCT FROM NEW.start_time
     OR OLD.end_time IS DISTINCT FROM NEW.end_time
     OR OLD.note IS DISTINCT FROM NEW.note
     OR OLD.created_by IS DISTINCT FROM NEW.created_by
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'period_exceptions is append-only except revocation fields';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS period_exceptions_guard_update ON period_exceptions;
CREATE TRIGGER period_exceptions_guard_update
  BEFORE UPDATE ON period_exceptions
  FOR EACH ROW EXECUTE FUNCTION edrion_period_exceptions_guard_update();

CREATE OR REPLACE FUNCTION edrion_period_exceptions_block_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'period_exceptions rows cannot be deleted; revoke instead';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS period_exceptions_no_delete ON period_exceptions;
CREATE TRIGGER period_exceptions_no_delete
  BEFORE DELETE ON period_exceptions
  FOR EACH ROW EXECUTE FUNCTION edrion_period_exceptions_block_delete();

GRANT SELECT, INSERT, UPDATE ON ics_tokens TO edrion_app;
