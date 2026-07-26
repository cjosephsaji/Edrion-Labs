INSERT INTO feature_definitions (key, name, description, module, status, default_value, available_scopes, dependencies, release_stage, owner)
VALUES
  ('clubs.directory_enabled', 'Clubs directory', 'Student clubs directory', 'student-portal', 'active', false, '["institution","campus"]', '["student.surface.clubs"]', 'beta', 'student-experience'),
  ('grievance.lane.formal', 'Formal grievance lane', 'Formal campus grievance requests', 'student-portal', 'active', false, '["institution"]', '["student.surface.grievance"]', 'beta', 'student-experience'),
  ('grievance.lane.sensitive', 'Sensitive grievance lane', 'Sealed sensitive reports', 'student-portal', 'active', false, '["institution"]', '["student.surface.grievance"]', 'beta', 'student-experience')
ON CONFLICT (key) DO NOTHING;
