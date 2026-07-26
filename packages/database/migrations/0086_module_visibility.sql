-- Module Visibility Phase 1: reference catalogue, repository-authoritative feature definitions,
-- assignment integrity, independent-user defaults, and institution-module dependency switches.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM feature_assignments
    GROUP BY feature_id, scope, scope_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'feature_assignments contains duplicate (feature_id, scope, scope_id) rows; reconcile before applying 0086';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS feature_assignments_definition_scope_unique
  ON feature_assignments (feature_id, scope, COALESCE(scope_id, ''));

CREATE TABLE IF NOT EXISTS student_modules (
  key text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('academics','money','campus','life','learning')),
  min_tier text NOT NULL CHECK (min_tier IN ('individual','school','college')),
  seeded_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO student_modules (key, category, min_tier, seeded_at) VALUES
  ('timetable','academics','school',now()), ('attendance','academics','school',now()),
  ('results','academics','school',now()), ('registration','academics','college',now()),
  ('exam_prep','learning','individual',now()), ('fees','money','school',now()),
  ('documents','campus','school',now()), ('transport','campus','school',now()),
  ('hostel','campus','college',now()), ('campus_library','campus','school',now()),
  ('health','campus','school',now()), ('id_card','campus','school',now()),
  ('diary','life','school',now()), ('clubs','life','school',now()),
  ('events','life','school',now()), ('placements','life','college',now()),
  ('grievance','life','school',now()), ('announcements','life','school',now()),
  ('learn','learning','individual',now()), ('library','learning','individual',now()),
  ('lab','learning','individual',now()), ('planner','learning','individual',now()),
  ('progress','learning','individual',now())
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category, min_tier = EXCLUDED.min_tier, seeded_at = EXCLUDED.seeded_at;

-- Existing student surface defaults are deliberately preserved on conflict.
INSERT INTO feature_definitions
  (id, key, name, description, module, status, default_value, available_scopes, release_stage, created_at, updated_at)
VALUES
  (gen_random_uuid(),'student.surface.timetable','Timetable surface','Show timetable to students','student-portal','active',true,'["institution","campus","institution_user"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.attendance','Attendance surface','Show attendance to students','student-portal','active',true,'["institution","campus","institution_user"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.results','Results surface','Show results to students','student-portal','active',true,'["institution","campus","institution_user"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.registration','Registration surface','Show registration to students','student-portal','active',false,'["institution","campus","institution_user"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.exam_prep','Exam Prep surface','Show Exam Prep to students','student-portal','active',false,'["independent_user","plan"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.fees','Fees surface','Show fees to students','student-portal','active',false,'["institution","campus","institution_user"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.documents','Documents surface','Show documents to students','student-portal','active',false,'["institution","campus","institution_user"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.transport','Transport surface','Show transport to students','student-portal','active',false,'["institution","campus","institution_user"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.hostel','Hostel surface','Show hostel to students','student-portal','active',false,'["institution","campus","institution_user"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.campus_library','Campus Library surface','Show campus library to students','student-portal','active',false,'["institution","campus","institution_user"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.health','Health surface','Show health to students','student-portal','active',false,'["institution","campus","institution_user"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.id_card','ID Card surface','Show ID card to students','student-portal','active',true,'["institution","campus","institution_user"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.diary','Diary surface','Show diary to students','student-portal','active',false,'["institution","campus","institution_user"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.clubs','Clubs surface','Show clubs to students','student-portal','active',false,'["institution","campus","institution_user"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.events','Events surface','Show events to students','student-portal','active',false,'["institution","campus","institution_user"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.placements','Placements surface','Show placements to students','student-portal','active',false,'["institution","campus","institution_user"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.grievance','Grievance surface','Show grievance to students','student-portal','active',false,'["institution","campus","institution_user"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.announcements','Announcements surface','Show announcements to students','student-portal','active',true,'["institution","campus","institution_user"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.learn','Learn surface','Show Learn to students','student-portal','active',true,'["institution","campus","institution_user","independent_user","plan"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.library','Library surface','Show personal Library to students','student-portal','active',true,'["institution","campus","institution_user","independent_user","plan"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.lab','Lab surface','Show Lab to students','student-portal','active',true,'["institution","campus","institution_user","independent_user","plan"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.planner','Planner surface','Show Planner to independent users','student-portal','active',false,'["independent_user","plan"]','ga',now(),now()),
  (gen_random_uuid(),'student.surface.progress','Progress surface','Show Progress to independent users','student-portal','active',false,'["independent_user","plan"]','ga',now(),now())
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, module = EXCLUDED.module,
  available_scopes = EXCLUDED.available_scopes, updated_at = now();

-- Master switches requested for dependencies. Defaults are ON so adding the control is non-breaking.
INSERT INTO feature_definitions
  (id, key, name, description, module, status, default_value, available_scopes, release_stage, created_at, updated_at)
SELECT gen_random_uuid(), 'institution.module.' || key, initcap(replace(key,'_',' ')) || ' module',
       'Institution module activation switch', 'institution-modules', 'active', true,
       '["plan","institution","campus"]'::jsonb, 'ga', now(), now()
FROM unnest(ARRAY['timetable','attendance','grading','registration','fees','transport','hostel','library','health','diary','clubs','events','placements']) AS key
ON CONFLICT (key) DO NOTHING;

-- Backfill the individual preset for existing independent accounts. The unique index makes it idempotent.
INSERT INTO feature_assignments (id, feature_id, scope, scope_id, value, enabled, reason, created_at, updated_at)
SELECT gen_random_uuid(), d.id, 'independent_user', u.id::text, true, true,
       'Individual student-portal preset', now(), now()
FROM independent_users u
CROSS JOIN feature_definitions d
WHERE d.key IN (
  'student.surface.learn','student.surface.library','student.surface.lab',
  'student.surface.planner','student.surface.progress','student.surface.exam_prep'
)
ON CONFLICT DO NOTHING;

GRANT SELECT ON student_modules TO edrion_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON student_modules FROM edrion_app;
