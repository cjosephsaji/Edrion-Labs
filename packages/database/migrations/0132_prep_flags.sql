INSERT INTO feature_definitions (key, name, description, module, status, default_value, available_scopes, dependencies, release_stage, owner)
VALUES
  ('prep.profile.sat_digital', 'SAT prep profile', 'SAT Digital prep mode', 'student-portal', 'active', false, '["global","plan","institution","campus","institution_user","independent_user"]', '["student.surface.exam_prep"]', 'beta', 'student-experience'),
  ('prep.profile.act_enhanced', 'ACT prep profile', 'ACT prep mode', 'student-portal', 'active', false, '["global","plan","institution","campus","institution_user","independent_user"]', '["student.surface.exam_prep"]', 'beta', 'student-experience'),
  ('prep.adaptive_routing', 'SAT adaptive routing', 'Two-stage SAT module routing', 'student-portal', 'active', false, '["global","plan","institution"]', '["prep.profile.sat_digital"]', 'beta', 'student-experience'),
  ('prep.cohort_dashboard', 'Prep cohort dashboard', 'Institution cohort prep analytics', 'student-portal', 'active', false, '["institution"]', '["student.surface.exam_prep"]', 'beta', 'student-experience'),
  ('prep.parent_digest', 'Prep parent digest', 'Parent digest for exam prep', 'student-portal', 'active', false, '["institution"]', '["student.surface.exam_prep"]', 'beta', 'student-experience')
ON CONFLICT (key) DO UPDATE SET dependencies = EXCLUDED.dependencies;
