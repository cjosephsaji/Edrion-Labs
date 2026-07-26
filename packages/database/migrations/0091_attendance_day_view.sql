INSERT INTO feature_definitions(key, name, description, module, status, default_value, available_scopes, dependencies, release_stage, owner)
VALUES
  (
    'attendance.day_view',
    'Attendance day view',
    'School heat-strip calendar on the student attendance screen',
    'student-portal',
    'active',
    false,
    '["global","plan","institution","campus","institution_user"]',
    '["student.surface.attendance"]',
    'ga',
    'student-experience'
  )
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  module = EXCLUDED.module,
  default_value = EXCLUDED.default_value,
  dependencies = EXCLUDED.dependencies;
