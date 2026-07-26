-- Debate P1 capability flags (default off until pilot).

INSERT INTO feature_definitions (key, name, description, module, status, default_value, available_scopes, dependencies, release_stage, owner)
VALUES
  (
    'lab.debate.enabled',
    'Debate lab (P1)',
    'Recorded debate practice, adjudication, and clash maps in The Lab',
    'student-portal',
    'active',
    false,
    '["global","plan","institution","campus","institution_user","independent_user"]',
    '["student.surface.lab"]',
    'beta',
    'student-experience'
  ),
  (
    'lab.debate.ai_opponent',
    'Debate AI opponent',
    'Practice solo rounds with recorded AI opponent speeches',
    'student-portal',
    'active',
    false,
    '["global","plan","institution","campus","institution_user","independent_user"]',
    '["lab.debate.enabled"]',
    'beta',
    'student-experience'
  ),
  (
    'lab.debate.spar_1v1',
    'Debate 1v1 spar',
    'Invite-only async 1v1 recorded spar rounds',
    'student-portal',
    'active',
    false,
    '["global","plan","institution","campus","institution_user","independent_user"]',
    '["lab.debate.enabled"]',
    'beta',
    'student-experience'
  )
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  default_value = EXCLUDED.default_value,
  dependencies = EXCLUDED.dependencies,
  release_stage = EXCLUDED.release_stage;
