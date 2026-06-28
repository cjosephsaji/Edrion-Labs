/**
 * The INSTITUTION permission catalogue — the registry of every granular permission inside the
 * tenant-facing Institution Portal. Entirely separate from the platform catalogue (catalogue.ts),
 * which governs Edrion staff. Institution roles (institution/roles.ts) are bags of these keys;
 * code checks keys, never role names.
 *
 * A second dimension — scope (institution vs specific campuses) — is enforced alongside these
 * keys at the API/service layer (see InstitutionScope in @edrion/auth). A permission answers
 * "what action"; the scope answers "which campuses".
 */
import type { PermissionDef } from '../catalogue';

const def = (
  key: string,
  group: string,
  description: string,
  sensitive = false,
): PermissionDef => ({ key, group, description, sensitive });

export const INSTITUTION_PERMISSIONS: readonly PermissionDef[] = [
  def('portal.dashboard.view', 'Overview', 'View the institution dashboard.'),

  // Academic structure (years, departments, grade levels, classes/sections, subjects)
  def('academics.view', 'Academics', 'View academic structure (years, departments, grades, classes, subjects).'),
  def('academics.manage', 'Academics', 'Create and edit academic structure.', true),

  // Campuses
  def('campuses.view', 'Campuses', 'View campuses in the institution.'),
  def('campuses.manage', 'Campuses', 'Create and configure campuses.', true),

  // Students
  def('students.view', 'Students', 'View students and profiles.'),
  def('students.create', 'Students', 'Enrol / create students.'),
  def('students.update', 'Students', 'Edit student records.'),
  def('students.delete', 'Students', 'Delete / archive students.', true),

  // Teachers
  def('teachers.view', 'Teachers', 'View teachers.'),
  def('teachers.manage', 'Teachers', 'Create and edit teachers and assignments.'),

  // Staff (non-teaching)
  def('staff.view', 'Staff', 'View non-teaching staff.'),
  def('staff.manage', 'Staff', 'Create and edit staff.'),

  // Parents / guardians
  def('parents.view', 'Parents', 'View parents and guardian links.'),
  def('parents.manage', 'Parents', 'Create and edit parents and links.'),

  // Admissions
  def('admissions.view', 'Admissions', 'View admission applications.'),
  def('admissions.manage', 'Admissions', 'Process and decide admissions.'),

  // Attendance
  def('attendance.view', 'Attendance', 'View attendance.'),
  def('attendance.manage', 'Attendance', 'Mark and edit attendance.'),

  // Timetable
  def('timetable.view', 'Timetable', 'View timetables.'),
  def('timetable.manage', 'Timetable', 'Create and edit timetables.'),

  // Exams
  def('exams.view', 'Exams', 'View exams and schedules.'),
  def('exams.manage', 'Exams', 'Create and edit exams.'),

  // Gradebook
  def('gradebook.view', 'Gradebook', 'View grades.'),
  def('gradebook.manage', 'Gradebook', 'Enter and edit grades.', true),

  // Assignments
  def('assignments.view', 'Assignments', 'View assignments.'),
  def('assignments.manage', 'Assignments', 'Create, edit and grade assignments.'),

  // Fees
  def('fees.view', 'Fees', 'View fee structures and invoices.'),
  def('fees.manage', 'Fees', 'Create fee structures, invoices and record payments.', true),

  // Payroll
  def('payroll.view', 'Payroll', 'View payroll.'),
  def('payroll.manage', 'Payroll', 'Run payroll and edit salaries.', true),

  // Library
  def('library.view', 'Library', 'View library catalogue and loans.'),
  def('library.manage', 'Library', 'Manage catalogue and issue/return.'),

  // Transport
  def('transport.view', 'Transport', 'View transport routes and assignments.'),
  def('transport.manage', 'Transport', 'Manage routes, vehicles and assignments.'),

  // Inventory
  def('inventory.view', 'Inventory', 'View inventory and assets.'),
  def('inventory.manage', 'Inventory', 'Manage inventory and stock.'),

  // Hostel
  def('hostel.view', 'Hostel', 'View hostel blocks and allocations.'),
  def('hostel.manage', 'Hostel', 'Manage hostel allocations.'),

  // Announcements & messaging
  def('announcements.view', 'Communication', 'View announcements.'),
  def('announcements.send', 'Communication', 'Publish announcements.', true),
  def('messages.use', 'Communication', 'Use direct messaging.'),

  // Reports
  def('reports.view', 'Reports', 'View reports and analytics.'),
  def('reports.export', 'Reports', 'Export reports.', true),

  // Users & roles
  def('users.view', 'User Management', 'View institution users.'),
  def('users.invite', 'User Management', 'Invite institution users.'),
  def('users.manage', 'User Management', 'Edit and disable institution users.', true),
  def('users.manage_roles', 'User Management', 'Assign roles and campus access.', true),
  def('roles.view', 'Roles & Permissions', 'View roles and permissions.'),
  def('roles.manage', 'Roles & Permissions', 'Create and edit roles.', true),

  // Settings
  def('institution_settings.view', 'Settings', 'View institution settings.'),
  def('institution_settings.manage', 'Settings', 'Manage institution settings.', true),
  def('campus_settings.manage', 'Settings', 'Manage campus-level settings.', true),

  // AI
  def('ai.use', 'AI', 'Use the AI Copilot.'),
  def('ai.configure', 'AI', 'Configure AI settings and guardrails.', true),

  // Audit
  def('audit.view', 'Audit', 'View audit logs.'),
  def('audit.export', 'Audit', 'Export audit logs.', true),
] as const;

/** Literal union of all valid institution permission keys. */
export type InstitutionPermissionKey = (typeof INSTITUTION_PERMISSIONS)[number]['key'];

export const ALL_INSTITUTION_PERMISSION_KEYS: readonly string[] = INSTITUTION_PERMISSIONS.map(
  (p) => p.key,
);

const byKey = new Map(INSTITUTION_PERMISSIONS.map((p) => [p.key, p]));

export function getInstitutionPermission(key: string): PermissionDef | undefined {
  return byKey.get(key);
}

export function isInstitutionSensitive(key: string): boolean {
  return byKey.get(key)?.sensitive ?? false;
}
