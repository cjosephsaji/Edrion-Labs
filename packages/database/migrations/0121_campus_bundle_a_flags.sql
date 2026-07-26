-- Campus Bundle A capability flags.

INSERT INTO feature_definitions (key, name, description, module, status, default_value, available_scopes, dependencies, release_stage, owner)
VALUES
  ('campus_library.holds', 'Campus library holds', 'Place and manage campus library holds', 'student-portal', 'active', false, '["global","plan","institution","campus","institution_user"]', '["student.surface.campus_library"]', 'beta', 'student-experience'),
  ('campus_library.fines', 'Campus library fines', 'Post library fines to fee invoices', 'student-portal', 'active', false, '["global","plan","institution","campus"]', '["campus_library.holds"]', 'beta', 'student-experience'),
  ('transport.broadcasts', 'Transport broadcasts', 'Driver/route broadcast notifications', 'student-portal', 'active', false, '["global","plan","institution","campus","institution_user"]', '["student.surface.transport"]', 'beta', 'student-experience'),
  ('id_card.digital', 'Digital ID card', 'Rotating-token digital ID card', 'student-portal', 'active', false, '["global","plan","institution","campus","institution_user"]', '["student.surface.id_card"]', 'beta', 'student-experience'),
  ('hostel.outpass', 'Hostel outpass', 'Student outpass requests and gate scans', 'student-portal', 'active', false, '["global","plan","institution","campus","institution_user"]', '["student.surface.hostel"]', 'beta', 'student-experience'),
  ('hostel.complaints', 'Hostel complaints', 'Hostel complaint work orders', 'student-portal', 'active', false, '["global","plan","institution","campus","institution_user"]', '["student.surface.hostel"]', 'beta', 'student-experience')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  dependencies = EXCLUDED.dependencies;
