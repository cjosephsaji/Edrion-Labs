-- Re-assert student portal feature definitions.
-- `db:seed` truncates feature_definitions and historically omitted these keys,
-- which made GET /v1/student/me return 404 Feature not found.
INSERT INTO "feature_definitions" ("id", "key", "name", "description", "module", "status", "default_value", "available_scopes", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'student.portal', 'Student portal', 'Master kill-switch for the student portal', 'student-portal', 'active', true, '["institution","campus","institution_user"]'::jsonb, now(), now()),
  (gen_random_uuid(), 'student.surface.fees', 'Fees surface', 'Show fee summary to students', 'student-portal', 'active', false, '["institution","campus","institution_user"]'::jsonb, now(), now()),
  (gen_random_uuid(), 'student.surface.transport', 'Transport surface', 'Show transport info to students', 'student-portal', 'active', false, '["institution","campus","institution_user"]'::jsonb, now(), now()),
  (gen_random_uuid(), 'student.surface.hostel', 'Hostel surface', 'Show hostel info to students', 'student-portal', 'active', false, '["institution","campus","institution_user"]'::jsonb, now(), now()),
  (gen_random_uuid(), 'student.surface.documents', 'Documents surface', 'Show institution documents to students', 'student-portal', 'active', false, '["institution","campus","institution_user"]'::jsonb, now(), now()),
  (gen_random_uuid(), 'student.surface.content', 'Content pages surface', 'Show custom content pages to students', 'student-portal', 'active', false, '["institution","campus","institution_user"]'::jsonb, now(), now()),
  (gen_random_uuid(), 'student.surface.exams', 'Exams surface', 'Show institution exams to students', 'student-portal', 'active', false, '["institution","campus","institution_user"]'::jsonb, now(), now()),
  (gen_random_uuid(), 'student.expert_mode', 'Expert mode', 'Allow independent learners to enable exam prep mode', 'student-portal', 'active', true, '["institution_user"]'::jsonb, now(), now()),
  (gen_random_uuid(), 'student.learn.engine', 'Learn engine', 'Petros learn features', 'student-portal', 'active', true, '["institution","campus","institution_user"]'::jsonb, now(), now()),
  (gen_random_uuid(), 'student.lab.debate_friend', 'Debate friend mode', 'Allow friend debate mode in the lab', 'student-portal', 'active', true, '["institution_user"]'::jsonb, now(), now())
ON CONFLICT ("key") DO NOTHING;
