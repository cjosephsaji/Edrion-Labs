CREATE TABLE IF NOT EXISTS "library_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"title" text NOT NULL,
	"author" text,
	"isbn" text,
	"category" text,
	"publisher" text,
	"total_copies" integer DEFAULT 1 NOT NULL,
	"available_copies" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"description" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"issue_date" date,
	"due_date" date,
	"return_date" date,
	"fine_amount" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transport_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"stop_name" text,
	"pickup_time" text,
	"drop_time" text,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transport_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"name" text NOT NULL,
	"code" text,
	"description" text,
	"fare" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transport_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"registration_no" text NOT NULL,
	"model" text,
	"capacity" integer DEFAULT 0 NOT NULL,
	"route_id" uuid,
	"driver_name" text,
	"driver_phone" text,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"name" text NOT NULL,
	"sku" text NOT NULL,
	"category" text,
	"unit" text,
	"quantity" integer DEFAULT 0 NOT NULL,
	"reorder_level" integer DEFAULT 0 NOT NULL,
	"unit_value" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"description" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"movement_type" text DEFAULT 'in' NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"reason" text,
	"reference" text,
	"moved_date" date,
	"notes" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostel_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"bed_no" text,
	"from_date" date,
	"to_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostel_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"name" text NOT NULL,
	"code" text,
	"block_type" text DEFAULT 'mixed' NOT NULL,
	"warden" text,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostel_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"block_id" uuid,
	"room_no" text NOT NULL,
	"floor" text,
	"capacity" integer DEFAULT 1 NOT NULL,
	"occupied" integer DEFAULT 0 NOT NULL,
	"room_type" text,
	"status" text DEFAULT 'available' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "library_books" ADD CONSTRAINT "library_books_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "library_books" ADD CONSTRAINT "library_books_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_book_id_library_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."library_books"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_route_id_transport_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."transport_routes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transport_vehicles" ADD CONSTRAINT "transport_vehicles_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transport_vehicles" ADD CONSTRAINT "transport_vehicles_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transport_vehicles" ADD CONSTRAINT "transport_vehicles_route_id_transport_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."transport_routes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_room_id_hostel_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."hostel_rooms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hostel_blocks" ADD CONSTRAINT "hostel_blocks_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hostel_blocks" ADD CONSTRAINT "hostel_blocks_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_block_id_hostel_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."hostel_blocks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_books_institution_idx" ON "library_books" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_books_institution_campus_idx" ON "library_books" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_books_status_idx" ON "library_books" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_loans_institution_idx" ON "library_loans" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_loans_book_idx" ON "library_loans" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_loans_student_idx" ON "library_loans" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_loans_status_idx" ON "library_loans" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_assignments_institution_idx" ON "transport_assignments" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_assignments_route_idx" ON "transport_assignments" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_assignments_student_idx" ON "transport_assignments" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transport_assignment_uniq" ON "transport_assignments" USING btree ("route_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_routes_institution_idx" ON "transport_routes" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_routes_institution_campus_idx" ON "transport_routes" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_routes_status_idx" ON "transport_routes" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_vehicles_institution_idx" ON "transport_vehicles" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_vehicles_institution_campus_idx" ON "transport_vehicles" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_vehicles_route_idx" ON "transport_vehicles" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_vehicles_status_idx" ON "transport_vehicles" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_items_institution_idx" ON "inventory_items" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_items_institution_campus_idx" ON "inventory_items" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_items_status_idx" ON "inventory_items" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_item_sku_uniq" ON "inventory_items" USING btree ("institution_id","sku");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_movements_institution_idx" ON "inventory_movements" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_movements_item_idx" ON "inventory_movements" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hostel_allocations_institution_idx" ON "hostel_allocations" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hostel_allocations_room_idx" ON "hostel_allocations" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hostel_allocations_student_idx" ON "hostel_allocations" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hostel_allocations_status_idx" ON "hostel_allocations" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hostel_blocks_institution_idx" ON "hostel_blocks" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hostel_blocks_institution_campus_idx" ON "hostel_blocks" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hostel_blocks_status_idx" ON "hostel_blocks" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hostel_rooms_institution_idx" ON "hostel_rooms" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hostel_rooms_institution_campus_idx" ON "hostel_rooms" USING btree ("institution_id","campus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hostel_rooms_block_idx" ON "hostel_rooms" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hostel_rooms_status_idx" ON "hostel_rooms" USING btree ("status");