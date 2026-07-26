-- Mock exams visibility capability (Tier 2 D4+)
INSERT INTO feature_definitions (key, name, description, module, status, default_value, available_scopes, dependencies, release_stage, owner)
VALUES (
  'lab.mock_exams.visibility',
  'Mock exams lab visibility',
  'Expose mock exam wizard and results in The Lab',
  'student-portal',
  'active',
  true,
  '["global","plan","institution","campus","institution_user","independent_user"]',
  '["student.surface.lab"]',
  'ga',
  'student-experience'
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  default_value = EXCLUDED.default_value,
  dependencies = EXCLUDED.dependencies;
