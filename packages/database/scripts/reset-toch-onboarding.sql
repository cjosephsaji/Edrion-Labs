-- Reset TocH Institute to onboarding — keep cjosephsaji@gmail.com only.
-- Dev/local use only.

BEGIN;

DO $$
DECLARE
  inst_id uuid := '973384e5-cd29-4133-91f5-91f04982303c';
  keep_user uuid := '2640616a-6658-4b64-9a9b-e4f51e171c9b';
BEGIN
  -- Sessions for removed users
  DELETE FROM portal_sessions
  WHERE institution_user_id IN (
    SELECT id FROM institution_users WHERE institution_id = inst_id AND id <> keep_user
  );

  -- Academics (children first)
  DELETE FROM programme_subjects WHERE institution_id = inst_id;
  DELETE FROM class_subject_teachers WHERE institution_id = inst_id;
  DELETE FROM classes WHERE institution_id = inst_id;
  DELETE FROM academic_terms WHERE institution_id = inst_id;
  DELETE FROM programme_term_slots WHERE institution_id = inst_id;
  DELETE FROM department_grade_levels WHERE institution_id = inst_id;
  DELETE FROM subjects WHERE institution_id = inst_id;
  DELETE FROM grade_levels WHERE institution_id = inst_id;
  DELETE FROM departments WHERE institution_id = inst_id;
  DELETE FROM academic_years WHERE institution_id = inst_id;

  -- People
  DELETE FROM student_guardians WHERE institution_id = inst_id;
  DELETE FROM students WHERE institution_id = inst_id;
  DELETE FROM parents WHERE institution_id = inst_id;
  DELETE FROM staff WHERE institution_id = inst_id;

  -- Admissions / attendance / ops (if any)
  DELETE FROM admission_applications WHERE institution_id = inst_id;
  DELETE FROM attendance_records WHERE institution_id = inst_id;
  DELETE FROM attendance_sessions WHERE institution_id = inst_id;
  DELETE FROM assignment_submissions WHERE institution_id = inst_id;
  DELETE FROM assignments WHERE institution_id = inst_id;
  DELETE FROM grade_entries WHERE institution_id = inst_id;
  DELETE FROM exam_schedules WHERE institution_id = inst_id;
  DELETE FROM exams WHERE institution_id = inst_id;
  DELETE FROM timetable_slots WHERE institution_id = inst_id;
  DELETE FROM fee_payments WHERE institution_id = inst_id;
  DELETE FROM fee_invoices WHERE institution_id = inst_id;
  DELETE FROM fee_structures WHERE institution_id = inst_id;
  DELETE FROM message_posts WHERE institution_id = inst_id;
  DELETE FROM message_threads WHERE institution_id = inst_id;
  DELETE FROM announcements WHERE institution_id = inst_id;
  DELETE FROM notifications WHERE institution_id = inst_id;

  -- Messages & documents
  DELETE FROM messages WHERE institution_id = inst_id;
  DELETE FROM conversation_participants WHERE conversation_id IN (
    SELECT id FROM conversations WHERE institution_id = inst_id
  );
  DELETE FROM conversations WHERE institution_id = inst_id;
  DELETE FROM institution_documents WHERE institution_id = inst_id;

  -- Other portal users
  DELETE FROM institution_users WHERE institution_id = inst_id AND id <> keep_user;

  -- Institution back to onboarding
  UPDATE institutions
  SET status = 'onboarding',
      onboarding_status = 'in_progress',
      activated_at = NULL,
      updated_at = now()
  WHERE id = inst_id;
END $$;

COMMIT;
