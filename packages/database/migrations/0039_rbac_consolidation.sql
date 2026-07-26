-- Phase 0 (Petros): consolidate the legacy super-admin `inst.*` RBAC model onto the
-- institution-portal catalogue.
--   1. front_desk role rows become receptionist (portal bundle covers the same duties).
--   2. Legacy `inst.*` direct grants/denies are mapped onto their portal-catalogue equivalents
--      via an explicit table. Denies fan out to ALL mapped keys so deny-wins keeps winning.
--   3. Petros deferral: strip `ai.use` direct grants from users whose ONLY roles are
--      student/parent (the default bundles no longer include it).

UPDATE institution_user_roles SET role_key = 'receptionist' WHERE role_key = 'front_desk';
--> statement-breakpoint

CREATE TEMP TABLE legacy_perm_map (legacy text NOT NULL, portal text NOT NULL);
--> statement-breakpoint
INSERT INTO legacy_perm_map (legacy, portal) VALUES
  ('inst.dashboard.view', 'portal.dashboard.view'),
  ('inst.students.view', 'students.view'),
  ('inst.students.manage', 'students.create'),
  ('inst.students.manage', 'students.update'),
  ('inst.staff.view', 'staff.view'),
  ('inst.staff.view', 'teachers.view'),
  ('inst.staff.manage', 'staff.manage'),
  ('inst.staff.manage', 'teachers.manage'),
  ('inst.classes.view', 'academics.view'),
  ('inst.classes.manage', 'academics.manage'),
  ('inst.attendance.manage', 'attendance.view'),
  ('inst.attendance.manage', 'attendance.manage'),
  ('inst.grades.manage', 'gradebook.view'),
  ('inst.grades.manage', 'gradebook.manage'),
  ('inst.timetable.manage', 'timetable.view'),
  ('inst.timetable.manage', 'timetable.manage'),
  ('inst.fees.view', 'fees.view'),
  ('inst.fees.manage', 'fees.manage'),
  ('inst.reports.view', 'reports.view'),
  ('inst.campus.manage', 'campuses.manage'),
  ('inst.campus.manage', 'campus_settings.manage'),
  ('inst.users.manage', 'users.manage'),
  ('inst.users.manage', 'users.manage_roles'),
  ('inst.settings.manage', 'institution_settings.manage');
--> statement-breakpoint

UPDATE institution_users u
SET direct_grants = sub.mapped
FROM (
  SELECT u2.id,
    COALESCE((
      SELECT jsonb_agg(DISTINCT x.p)
      FROM (
        SELECT COALESCE(m.portal, g.val) AS p
        FROM jsonb_array_elements_text(u2.direct_grants) AS g(val)
        LEFT JOIN legacy_perm_map m ON m.legacy = g.val
      ) x
      WHERE x.p NOT LIKE 'inst.%'
    ), '[]'::jsonb) AS mapped
  FROM institution_users u2
) sub
WHERE sub.id = u.id
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(u.direct_grants) g(val) WHERE g.val LIKE 'inst.%'
  );
--> statement-breakpoint

UPDATE institution_users u
SET direct_denies = sub.mapped
FROM (
  SELECT u2.id,
    COALESCE((
      SELECT jsonb_agg(DISTINCT x.p)
      FROM (
        SELECT COALESCE(m.portal, g.val) AS p
        FROM jsonb_array_elements_text(u2.direct_denies) AS g(val)
        LEFT JOIN legacy_perm_map m ON m.legacy = g.val
      ) x
      WHERE x.p NOT LIKE 'inst.%'
    ), '[]'::jsonb) AS mapped
  FROM institution_users u2
) sub
WHERE sub.id = u.id
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(u.direct_denies) g(val) WHERE g.val LIKE 'inst.%'
  );
--> statement-breakpoint

DROP TABLE legacy_perm_map;
--> statement-breakpoint

-- Petros deferral: users whose only roles are student/parent lose any ai.use direct grant.
UPDATE institution_users u
SET direct_grants = (
  SELECT COALESCE(jsonb_agg(t.v), '[]'::jsonb)
  FROM jsonb_array_elements_text(u.direct_grants) t(v)
  WHERE t.v <> 'ai.use'
)
WHERE u.direct_grants ? 'ai.use'
  AND EXISTS (SELECT 1 FROM institution_user_roles r WHERE r.institution_user_id = u.id)
  AND NOT EXISTS (
    SELECT 1 FROM institution_user_roles r
    WHERE r.institution_user_id = u.id AND r.role_key NOT IN ('student', 'parent')
  );
