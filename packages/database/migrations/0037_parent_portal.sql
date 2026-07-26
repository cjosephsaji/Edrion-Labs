-- Parent Portal (parent-web) schema: communication, engagement, notifications, wellbeing, safety,
-- money and documents. New parent-owned tables are `parent_`-prefixed to avoid colliding with the
-- staff-side messages/message_threads/notifications tables. Also extends exam_schedules (datesheet),
-- student_incidents (behaviour publish + ack), student_guardians (visibility_overrides) and
-- fee_invoices (unified fees source).

-- ── Extensions to existing tables ────────────────────────────────────────────
ALTER TABLE "exam_schedules"
	ADD COLUMN IF NOT EXISTS "syllabus_note" text,
	ADD COLUMN IF NOT EXISTS "hall" text,
	ADD COLUMN IF NOT EXISTS "seat_info" text,
	ADD COLUMN IF NOT EXISTS "published" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "student_incidents"
	ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "parent_ack_required" boolean DEFAULT false NOT NULL,
	ADD COLUMN IF NOT EXISTS "parent_acknowledged_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "student_guardians"
	ADD COLUMN IF NOT EXISTS "visibility_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "fee_invoices"
	ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'tuition' NOT NULL;
--> statement-breakpoint

-- ── parent_notices ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "parent_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"campus_id" uuid REFERENCES "public"."campuses"("id") ON DELETE cascade,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"audience_scope" text DEFAULT 'institution' NOT NULL,
	"audience_ref_id" uuid,
	"requires_acknowledgement" boolean DEFAULT false NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parent_notice_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"notice_id" uuid NOT NULL REFERENCES "public"."parent_notices"("id") ON DELETE cascade,
	"guardian_user_id" uuid NOT NULL REFERENCES "public"."institution_users"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "public"."students"("id") ON DELETE cascade,
	"read_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parent_message_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"campus_id" uuid REFERENCES "public"."campuses"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "public"."students"("id") ON DELETE cascade,
	"opened_by_guardian_id" uuid NOT NULL REFERENCES "public"."institution_users"("id") ON DELETE cascade,
	"category" text DEFAULT 'general' NOT NULL,
	"subject" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" uuid REFERENCES "public"."institution_users"("id") ON DELETE set null,
	"last_message_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"thread_id" uuid NOT NULL REFERENCES "public"."parent_message_threads"("id") ON DELETE cascade,
	"sender_type" text NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parent_emergency_broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"campus_id" uuid REFERENCES "public"."campuses"("id") ON DELETE cascade,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"severity" text DEFAULT 'urgent' NOT NULL,
	"audience_scope" text DEFAULT 'institution' NOT NULL,
	"audience_ref_id" uuid,
	"channels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sent_by" uuid NOT NULL REFERENCES "public"."institution_users"("id") ON DELETE set null,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"campus_id" uuid REFERENCES "public"."campuses"("id") ON DELETE cascade,
	"title" text NOT NULL,
	"type" text DEFAULT 'event' NOT NULL,
	"starts_on" timestamp with time zone NOT NULL,
	"ends_on" timestamp with time zone,
	"all_day" boolean DEFAULT true NOT NULL,
	"audience_scope" text DEFAULT 'institution' NOT NULL,
	"audience_ref_id" uuid,
	"description" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parent_consent_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"campus_id" uuid REFERENCES "public"."campuses"("id") ON DELETE cascade,
	"title" text NOT NULL,
	"description" text,
	"consent_type" text DEFAULT 'custom' NOT NULL,
	"audience_scope" text DEFAULT 'institution' NOT NULL,
	"audience_ref_id" uuid,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"due_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parent_consent_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"consent_form_id" uuid NOT NULL REFERENCES "public"."parent_consent_forms"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "public"."students"("id") ON DELETE cascade,
	"guardian_user_id" uuid NOT NULL REFERENCES "public"."institution_users"("id") ON DELETE cascade,
	"response" text NOT NULL,
	"note" text,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parent_ptm_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"campus_id" uuid REFERENCES "public"."campuses"("id") ON DELETE cascade,
	"title" text NOT NULL,
	"description" text,
	"starts_on" date,
	"ends_on" date,
	"slot_length_minutes" integer DEFAULT 15 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parent_ptm_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"event_id" uuid NOT NULL REFERENCES "public"."parent_ptm_events"("id") ON DELETE cascade,
	"teacher_id" uuid NOT NULL REFERENCES "public"."teachers"("id") ON DELETE cascade,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"booked_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parent_ptm_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"event_id" uuid NOT NULL REFERENCES "public"."parent_ptm_events"("id") ON DELETE cascade,
	"slot_id" uuid NOT NULL REFERENCES "public"."parent_ptm_slots"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "public"."students"("id") ON DELETE cascade,
	"guardian_user_id" uuid NOT NULL REFERENCES "public"."institution_users"("id") ON DELETE cascade,
	"status" text DEFAULT 'booked' NOT NULL,
	"note" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parent_absence_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"campus_id" uuid REFERENCES "public"."campuses"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "public"."students"("id") ON DELETE cascade,
	"guardian_user_id" uuid NOT NULL REFERENCES "public"."institution_users"("id") ON DELETE cascade,
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"reason_category" text DEFAULT 'other' NOT NULL,
	"note" text,
	"attachment" jsonb,
	"status" text DEFAULT 'submitted' NOT NULL,
	"reviewed_by" uuid REFERENCES "public"."institution_users"("id") ON DELETE set null,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parent_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"guardian_user_id" uuid NOT NULL REFERENCES "public"."institution_users"("id") ON DELETE cascade,
	"student_id" uuid REFERENCES "public"."students"("id") ON DELETE cascade,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"deep_link" text,
	"priority" text DEFAULT 'immediate' NOT NULL,
	"source_entity" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parent_notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"guardian_user_id" uuid NOT NULL REFERENCES "public"."institution_users"("id") ON DELETE cascade,
	"channels" jsonb DEFAULT '{"email":true,"push":true,"sms":false,"whatsapp":false}'::jsonb NOT NULL,
	"category_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"digest_day" integer DEFAULT 1 NOT NULL,
	"digest_enabled" boolean DEFAULT true NOT NULL,
	"quiet_hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parent_digest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"guardian_count" integer DEFAULT 0 NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parent_digest_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"run_id" uuid REFERENCES "public"."parent_digest_runs"("id") ON DELETE cascade,
	"guardian_user_id" uuid NOT NULL REFERENCES "public"."institution_users"("id") ON DELETE cascade,
	"channel" text NOT NULL,
	"payload_hash" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parent_health_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"campus_id" uuid REFERENCES "public"."campuses"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "public"."students"("id") ON DELETE cascade,
	"blood_group" text,
	"allergies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chronic_conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_medications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dietary_restrictions" text,
	"doctor_name" text,
	"doctor_phone" text,
	"insurance_ref" text,
	"vaccinations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"emergency_contacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_verified_by" uuid REFERENCES "public"."institution_users"("id") ON DELETE set null,
	"last_verified_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_recognitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"campus_id" uuid REFERENCES "public"."campuses"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "public"."students"("id") ON DELETE cascade,
	"type" text DEFAULT 'merit' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"awarded_by" uuid REFERENCES "public"."institution_users"("id") ON DELETE set null,
	"certificate_document_id" uuid,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "counseling_disclosures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"campus_id" uuid REFERENCES "public"."campuses"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "public"."students"("id") ON DELETE cascade,
	"counselor_user_id" uuid NOT NULL REFERENCES "public"."institution_users"("id") ON DELETE set null,
	"counselor_display_name" text NOT NULL,
	"contact_note" text,
	"disclosed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pickup_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"campus_id" uuid REFERENCES "public"."campuses"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "public"."students"("id") ON DELETE cascade,
	"guardian_user_id" uuid NOT NULL REFERENCES "public"."institution_users"("id") ON DELETE cascade,
	"person_name" text NOT NULL,
	"relationship" text,
	"phone" text,
	"photo_document_id" uuid,
	"id_proof_document_id" uuid,
	"status" text DEFAULT 'pending_school_verification' NOT NULL,
	"valid_until" date,
	"verified_by" uuid REFERENCES "public"."institution_users"("id") ON DELETE set null,
	"verified_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "early_leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"campus_id" uuid REFERENCES "public"."campuses"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "public"."students"("id") ON DELETE cascade,
	"guardian_user_id" uuid NOT NULL REFERENCES "public"."institution_users"("id") ON DELETE cascade,
	"leave_date" date NOT NULL,
	"leave_time" text,
	"reason" text,
	"pickup_authorization_id" uuid REFERENCES "public"."pickup_authorizations"("id") ON DELETE set null,
	"status" text DEFAULT 'requested' NOT NULL,
	"gate_pass_id" uuid,
	"decided_by" uuid REFERENCES "public"."institution_users"("id") ON DELETE set null,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gate_exit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"campus_id" uuid REFERENCES "public"."campuses"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "public"."students"("id") ON DELETE cascade,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" uuid REFERENCES "public"."institution_users"("id") ON DELETE set null,
	"pickup_person" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transport_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"campus_id" uuid REFERENCES "public"."campuses"("id") ON DELETE cascade,
	"route_id" uuid NOT NULL REFERENCES "public"."transport_routes"("id") ON DELETE cascade,
	"vehicle_id" uuid REFERENCES "public"."transport_vehicles"("id") ON DELETE set null,
	"type" text DEFAULT 'delay' NOT NULL,
	"description" text,
	"affects_date" date,
	"status" text DEFAULT 'open' NOT NULL,
	"recorded_by" uuid REFERENCES "public"."institution_users"("id") ON DELETE set null,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostel_outing_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"campus_id" uuid REFERENCES "public"."campuses"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "public"."students"("id") ON DELETE cascade,
	"guardian_user_id" uuid NOT NULL REFERENCES "public"."institution_users"("id") ON DELETE cascade,
	"type" text DEFAULT 'outing' NOT NULL,
	"from_at" timestamp with time zone NOT NULL,
	"to_at" timestamp with time zone NOT NULL,
	"reason" text,
	"status" text DEFAULT 'requested' NOT NULL,
	"decided_by" uuid REFERENCES "public"."institution_users"("id") ON DELETE set null,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parent_payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"fee_invoice_id" uuid NOT NULL REFERENCES "public"."fee_invoices"("id") ON DELETE cascade,
	"guardian_user_id" uuid NOT NULL REFERENCES "public"."institution_users"("id") ON DELETE cascade,
	"amount" integer NOT NULL,
	"currency" "currency" DEFAULT 'INR' NOT NULL,
	"provider" text DEFAULT 'mock' NOT NULL,
	"provider_ref" text,
	"status" text DEFAULT 'created' NOT NULL,
	"idempotency_key" text,
	"settled_payment_id" uuid,
	"settled_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"campus_id" uuid REFERENCES "public"."campuses"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "public"."students"("id") ON DELETE cascade,
	"type" text DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"file_ref" text NOT NULL,
	"content_type" text,
	"issued_at" timestamp with time zone,
	"published" boolean DEFAULT true NOT NULL,
	"issued_by" uuid REFERENCES "public"."institution_users"("id") ON DELETE set null,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"campus_id" uuid REFERENCES "public"."campuses"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "public"."students"("id") ON DELETE cascade,
	"guardian_user_id" uuid NOT NULL REFERENCES "public"."institution_users"("id") ON DELETE cascade,
	"type" text DEFAULT 'custom' NOT NULL,
	"note" text,
	"status" text DEFAULT 'requested' NOT NULL,
	"fee_invoice_id" uuid REFERENCES "public"."fee_invoices"("id") ON DELETE set null,
	"fulfilled_document_id" uuid REFERENCES "public"."student_documents"("id") ON DELETE set null,
	"decided_by" uuid REFERENCES "public"."institution_users"("id") ON DELETE set null,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL REFERENCES "public"."institutions"("id") ON DELETE cascade,
	"campus_id" uuid REFERENCES "public"."campuses"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "public"."students"("id") ON DELETE cascade,
	"guardian_user_id" uuid NOT NULL REFERENCES "public"."institution_users"("id") ON DELETE cascade,
	"field_group" text DEFAULT 'other' NOT NULL,
	"proposed_changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"reviewed_by" uuid REFERENCES "public"."institution_users"("id") ON DELETE set null,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "parent_notices_institution_idx" ON "parent_notices" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_notices_institution_campus_idx" ON "parent_notices" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_notices_published_idx" ON "parent_notices" USING btree ("institution_id","published_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_notice_receipts_notice_idx" ON "parent_notice_receipts" USING btree ("notice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_notice_receipts_guardian_idx" ON "parent_notice_receipts" USING btree ("guardian_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "parent_notice_receipt_uniq" ON "parent_notice_receipts" USING btree ("notice_id","guardian_user_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_message_threads_institution_idx" ON "parent_message_threads" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_message_threads_student_idx" ON "parent_message_threads" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_message_threads_guardian_idx" ON "parent_message_threads" USING btree ("opened_by_guardian_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_message_threads_assigned_idx" ON "parent_message_threads" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_messages_thread_idx" ON "parent_messages" USING btree ("thread_id","sent_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_emergency_broadcasts_institution_idx" ON "parent_emergency_broadcasts" USING btree ("institution_id","sent_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_events_institution_idx" ON "calendar_events" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_events_range_idx" ON "calendar_events" USING btree ("institution_id","starts_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_consent_forms_institution_idx" ON "parent_consent_forms" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_consent_forms_status_idx" ON "parent_consent_forms" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_consent_responses_form_idx" ON "parent_consent_responses" USING btree ("consent_form_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_consent_responses_active_idx" ON "parent_consent_responses" USING btree ("consent_form_id","student_id","superseded_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_ptm_events_institution_idx" ON "parent_ptm_events" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_ptm_events_status_idx" ON "parent_ptm_events" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_ptm_slots_event_idx" ON "parent_ptm_slots" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_ptm_slots_teacher_idx" ON "parent_ptm_slots" USING btree ("teacher_id","starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_ptm_bookings_event_idx" ON "parent_ptm_bookings" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_ptm_bookings_slot_idx" ON "parent_ptm_bookings" USING btree ("slot_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "parent_ptm_booking_active_uniq" ON "parent_ptm_bookings" USING btree ("event_id","student_id") WHERE status = 'booked';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_absence_notes_institution_idx" ON "parent_absence_notes" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_absence_notes_student_idx" ON "parent_absence_notes" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_absence_notes_status_idx" ON "parent_absence_notes" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_notifications_feed_idx" ON "parent_notifications" USING btree ("guardian_user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_notifications_unread_idx" ON "parent_notifications" USING btree ("guardian_user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "parent_notification_prefs_guardian_uniq" ON "parent_notification_preferences" USING btree ("guardian_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_digest_runs_institution_idx" ON "parent_digest_runs" USING btree ("institution_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_digest_deliveries_run_idx" ON "parent_digest_deliveries" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_digest_deliveries_guardian_idx" ON "parent_digest_deliveries" USING btree ("guardian_user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_health_profiles_student_idx" ON "parent_health_profiles" USING btree ("student_id","revision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_health_profiles_institution_idx" ON "parent_health_profiles" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_recognitions_student_idx" ON "student_recognitions" USING btree ("student_id","awarded_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_recognitions_institution_idx" ON "student_recognitions" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "counseling_disclosures_student_idx" ON "counseling_disclosures" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "counseling_disclosure_active_uniq" ON "counseling_disclosures" USING btree ("student_id") WHERE revoked_at is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pickup_authorizations_student_idx" ON "pickup_authorizations" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pickup_authorizations_status_idx" ON "pickup_authorizations" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "early_leave_requests_student_idx" ON "early_leave_requests" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "early_leave_requests_status_idx" ON "early_leave_requests" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_exit_events_student_idx" ON "gate_exit_events" USING btree ("student_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_exit_events_institution_idx" ON "gate_exit_events" USING btree ("institution_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_incidents_route_idx" ON "transport_incidents" USING btree ("route_id","affects_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_incidents_institution_idx" ON "transport_incidents" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hostel_outing_requests_student_idx" ON "hostel_outing_requests" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hostel_outing_requests_status_idx" ON "hostel_outing_requests" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_payment_intents_invoice_idx" ON "parent_payment_intents" USING btree ("fee_invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_payment_intents_guardian_idx" ON "parent_payment_intents" USING btree ("guardian_user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_payment_intents_provider_ref_idx" ON "parent_payment_intents" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "parent_payment_intents_idem_uniq" ON "parent_payment_intents" USING btree ("institution_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_documents_student_idx" ON "student_documents" USING btree ("student_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_documents_institution_idx" ON "student_documents" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_requests_student_idx" ON "document_requests" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_requests_status_idx" ON "document_requests" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_change_requests_student_idx" ON "profile_change_requests" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_change_requests_status_idx" ON "profile_change_requests" USING btree ("institution_id","status");
