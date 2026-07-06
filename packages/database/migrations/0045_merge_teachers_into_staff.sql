-- Merge teachers into staff (preserve teacher UUIDs so academics FK columns keep resolving).
-- Teaching is role-derived via academics.teach; the teachers table is dropped.

INSERT INTO staff (
  id, institution_id, campus_id, employee_no, first_name, last_name, email, phone,
  department_id, designation, employment_type, status, join_date, institution_user_id,
  version, created_by, updated_by, created_at, updated_at
)
SELECT
  t.id,
  t.institution_id,
  t.campus_id,
  CASE
    WHEN t.employee_no IS NOT NULL AND EXISTS (
      SELECT 1 FROM staff s
      WHERE s.institution_id = t.institution_id
        AND s.employee_no = t.employee_no
        AND s.id <> t.id
    ) THEN NULL
    ELSE t.employee_no
  END,
  t.first_name,
  t.last_name,
  t.email,
  t.phone,
  t.department_id,
  t.designation,
  t.employment_type,
  t.status,
  t.join_date,
  t.institution_user_id,
  t.version,
  t.created_by,
  t.updated_by,
  t.created_at,
  t.updated_at
FROM teachers t
WHERE NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = t.id);

-- Repoint FK constraints from teachers → staff
ALTER TABLE "class_subject_teachers" DROP CONSTRAINT IF EXISTS "class_subject_teachers_teacher_id_teachers_id_fk";
ALTER TABLE "classes" DROP CONSTRAINT IF EXISTS "classes_class_teacher_id_teachers_id_fk";
ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "departments_head_user_id_teachers_id_fk";
ALTER TABLE "timetable_slots" DROP CONSTRAINT IF EXISTS "timetable_slots_teacher_id_teachers_id_fk";
ALTER TABLE "assignments" DROP CONSTRAINT IF EXISTS "assignments_teacher_id_teachers_id_fk";
ALTER TABLE "payroll_items" DROP CONSTRAINT IF EXISTS "payroll_items_teacher_id_teachers_id_fk";
ALTER TABLE "attendance_sessions" DROP CONSTRAINT IF EXISTS "attendance_sessions_taken_by_id_teachers_id_fk";
ALTER TABLE "parent_ptm_slots" DROP CONSTRAINT IF EXISTS "parent_ptm_slots_teacher_id_fkey";

ALTER TABLE "class_subject_teachers" ADD CONSTRAINT "class_subject_teachers_teacher_id_staff_id_fk"
  FOREIGN KEY ("teacher_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "classes" ADD CONSTRAINT "classes_class_teacher_id_staff_id_fk"
  FOREIGN KEY ("class_teacher_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "departments" ADD CONSTRAINT "departments_head_user_id_staff_id_fk"
  FOREIGN KEY ("head_user_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_teacher_id_staff_id_fk"
  FOREIGN KEY ("teacher_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_teacher_id_staff_id_fk"
  FOREIGN KEY ("teacher_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_teacher_id_staff_id_fk"
  FOREIGN KEY ("teacher_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_taken_by_id_staff_id_fk"
  FOREIGN KEY ("taken_by_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "parent_ptm_slots" ADD CONSTRAINT "parent_ptm_slots_teacher_id_staff_id_fk"
  FOREIGN KEY ("teacher_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;

DROP TABLE IF EXISTS "teachers";
