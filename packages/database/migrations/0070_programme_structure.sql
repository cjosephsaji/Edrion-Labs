-- Programme structure: undated term slots owned by programmes, separating template from instance.
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "term_system" text DEFAULT 'term' NOT NULL;
--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "duration_months" integer;
--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "terms_per_year" integer DEFAULT 3 NOT NULL;
--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "structure_locked" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "programme_term_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"department_id" uuid NOT NULL,
	"programme_level_id" uuid NOT NULL,
	"sequence_in_year" integer DEFAULT 1 NOT NULL,
	"absolute_sequence" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'term' NOT NULL,
	"duration_months" integer,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "programme_term_slots" ADD CONSTRAINT "programme_term_slots_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "programme_term_slots" ADD CONSTRAINT "programme_term_slots_campus_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "programme_term_slots" ADD CONSTRAINT "programme_term_slots_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "programme_term_slots" ADD CONSTRAINT "programme_term_slots_programme_level_id_fk" FOREIGN KEY ("programme_level_id") REFERENCES "public"."department_grade_levels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
ALTER TABLE "programme_subjects" ADD COLUMN IF NOT EXISTS "slot_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "programme_subjects" ADD CONSTRAINT "programme_subjects_slot_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."programme_term_slots"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "slot_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_slot_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."programme_term_slots"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "programme_term_slots_level_seq_uniq" ON "programme_term_slots" ("programme_level_id","sequence_in_year");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "programme_term_slots_dept_abs_uniq" ON "programme_term_slots" ("department_id","absolute_sequence");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "programme_term_slots_institution_idx" ON "programme_term_slots" ("institution_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "programme_term_slots_institution_campus_idx" ON "programme_term_slots" ("institution_id","campus_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "programme_term_slots_department_idx" ON "programme_term_slots" ("department_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "programme_subjects_slot_idx" ON "programme_subjects" ("slot_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "academic_terms_slot_idx" ON "academic_terms" ("slot_id");
--> statement-breakpoint
-- Backfill: synthesise slots from existing terms / curriculum, then link rows.
DO $$
DECLARE
  lvl RECORD;
  seq_val integer;
  slot_row_id uuid;
  dept_abs_seq integer;
  level_slots integer;
  last_dept_id uuid := NULL;
  slot_kind text;
  slot_name text;
  dept_kind text;
BEGIN
  FOR lvl IN
    SELECT dgl.id AS level_id,
           dgl.department_id,
           dgl.institution_id,
           dgl.campus_id,
           dgl.sequence AS level_seq,
           gl.name AS grade_name
    FROM department_grade_levels dgl
    JOIN grade_levels gl ON gl.id = dgl.grade_level_id
    ORDER BY dgl.department_id, dgl.sequence
  LOOP
    -- absolute_sequence is unique per department, not per level — keep a running counter.
    IF lvl.department_id IS DISTINCT FROM last_dept_id THEN
      dept_abs_seq := 0;
      last_dept_id := lvl.department_id;
    END IF;

    level_slots := 0;

    FOR seq_val IN
      SELECT DISTINCT s FROM (
        SELECT at.sequence AS s FROM academic_terms at
        WHERE at.programme_level_id = lvl.level_id
        UNION
        SELECT ps.semester_sequence AS s FROM programme_subjects ps
        WHERE ps.programme_level_id = lvl.level_id
      ) q ORDER BY s
    LOOP
      dept_abs_seq := dept_abs_seq + 1;
      level_slots := level_slots + 1;

      SELECT mode() WITHIN GROUP (ORDER BY kind)
      INTO dept_kind
      FROM academic_terms
      WHERE programme_level_id = lvl.level_id AND sequence = seq_val;

      slot_kind := COALESCE(dept_kind, 'term');
      slot_name := slot_kind || ' ' || seq_val;

      INSERT INTO programme_term_slots (
        institution_id, campus_id, department_id, programme_level_id,
        sequence_in_year, absolute_sequence, name, kind
      )
      SELECT lvl.institution_id, lvl.campus_id, lvl.department_id, lvl.level_id,
             seq_val, dept_abs_seq, slot_name, slot_kind
      WHERE NOT EXISTS (
        SELECT 1 FROM programme_term_slots pts
        WHERE pts.programme_level_id = lvl.level_id AND pts.sequence_in_year = seq_val
      );
    END LOOP;

    IF level_slots = 0 THEN
      dept_abs_seq := dept_abs_seq + 1;

      INSERT INTO programme_term_slots (
        institution_id, campus_id, department_id, programme_level_id,
        sequence_in_year, absolute_sequence, name, kind
      )
      SELECT lvl.institution_id, lvl.campus_id, lvl.department_id, lvl.level_id,
             1, dept_abs_seq, 'Term 1', 'term'
      WHERE NOT EXISTS (
        SELECT 1 FROM programme_term_slots pts WHERE pts.programme_level_id = lvl.level_id
      );
    END IF;
  END LOOP;

  -- Normalise absolute_sequence per department in level order (idempotent safety pass).
  FOR lvl IN
    SELECT DISTINCT department_id FROM department_grade_levels
  LOOP
    dept_abs_seq := 0;
    FOR slot_row_id IN
      SELECT pts.id
      FROM programme_term_slots pts
      JOIN department_grade_levels dgl ON dgl.id = pts.programme_level_id
      WHERE pts.department_id = lvl.department_id
      ORDER BY dgl.sequence, pts.sequence_in_year
    LOOP
      dept_abs_seq := dept_abs_seq + 1;
      UPDATE programme_term_slots SET absolute_sequence = dept_abs_seq WHERE id = slot_row_id;
    END LOOP;
  END LOOP;

  UPDATE academic_terms at
  SET slot_id = pts.id
  FROM programme_term_slots pts
  WHERE at.programme_level_id = pts.programme_level_id
    AND at.sequence = pts.sequence_in_year
    AND at.slot_id IS NULL;

  UPDATE programme_subjects ps
  SET slot_id = pts.id
  FROM programme_term_slots pts
  WHERE ps.programme_level_id = pts.programme_level_id
    AND ps.semester_sequence = pts.sequence_in_year
    AND ps.slot_id IS NULL;

  UPDATE departments d
  SET term_system = COALESCE(sub.inferred, 'term'),
      terms_per_year = COALESCE(sub.max_seq, d.terms_per_year)
  FROM (
    SELECT at.department_id,
           mode() WITHIN GROUP (ORDER BY at.kind) AS inferred,
           MAX(at.sequence) AS max_seq
    FROM academic_terms at
    WHERE at.department_id IS NOT NULL
    GROUP BY at.department_id
  ) sub
  WHERE d.id = sub.department_id;

  -- Schools: auto-create a General programme and attach orphan grade levels.
  FOR lvl IN
    SELECT i.id AS institution_id, i.display_name, i.type
    FROM institutions i
    WHERE i.type = 'school'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM departments d
      WHERE d.institution_id = lvl.institution_id AND d.code = 'GENERAL'
    ) THEN
      INSERT INTO departments (institution_id, name, code, term_system, terms_per_year)
      VALUES (lvl.institution_id, lvl.display_name, 'GENERAL', 'term', 3);
    END IF;

    UPDATE grade_levels gl
    SET department_id = (
      SELECT d.id FROM departments d
      WHERE d.institution_id = lvl.institution_id AND d.code = 'GENERAL'
      LIMIT 1
    )
    WHERE gl.institution_id = lvl.institution_id
      AND gl.department_id IS NULL;

    INSERT INTO department_grade_levels (
      institution_id, department_id, grade_level_id, sequence, status
    )
    SELECT gl.institution_id,
           (SELECT d.id FROM departments d WHERE d.institution_id = gl.institution_id AND d.code = 'GENERAL' LIMIT 1),
           gl.id,
           gl.level,
           'active'
    FROM grade_levels gl
    WHERE gl.institution_id = lvl.institution_id
      AND gl.department_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM department_grade_levels dgl
        WHERE dgl.grade_level_id = gl.id
          AND dgl.department_id = (
            SELECT d.id FROM departments d
            WHERE d.institution_id = gl.institution_id AND d.code = 'GENERAL'
            LIMIT 1
          )
      );
  END LOOP;
END $$;
