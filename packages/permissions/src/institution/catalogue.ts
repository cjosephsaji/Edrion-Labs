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
  def('student_conduct.view', 'Students', 'View student conduct: behaviour incidents and complaints.'),
  def('student_conduct.manage', 'Students', 'Record and resolve student conduct incidents and complaints.', true),

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

  // Expenses (money out)
  def('expenses.view', 'Expenses', 'View school expenses.'),
  def('expenses.manage', 'Expenses', 'Record and edit school expenses.', true),

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
  def('users.assign_scoped_roles', 'User Management', 'Assign a limited set of operational staff roles within own campuses.', true),
  def('roles.view', 'Roles & Permissions', 'View roles and permissions.'),
  def('roles.manage', 'Roles & Permissions', 'Create and edit roles.', true),

  // Settings
  def('institution_settings.view', 'Settings', 'View institution settings.'),
  def('institution_settings.manage', 'Settings', 'Manage institution settings.', true),
  def('campus_settings.manage', 'Settings', 'Manage campus-level settings.', true),

  // Documents & Policies (handbooks, consent forms, policies)
  def('documents.view', 'Documents', 'View institution documents and policies.'),
  def('documents.manage', 'Documents', 'Upload and manage institution documents and policies.', true),

  // Billing (read-only tenant view of the Edrion subscription & invoices)
  def('billing.view', 'Billing', 'View the institution’s Edrion plan, subscription and invoices.'),

  // AI
  def('ai.use', 'AI', 'Use Petros, the AI assistant.'),
  def('ai.configure', 'AI', 'Configure AI settings and guardrails.', true),
  def('ai.assessments.generate', 'AI', 'Fully generate exams/assignments/tests with Petros.', true),
  def('ai.files.upload', 'AI', 'Attach files to Petros conversations.'),

  // Document generation (formatted institution documents — distinct from Documents & Policies)
  def('documents.generate', 'Documents', 'Generate formatted documents from templates.'),
  def('documents.templates.manage', 'Documents', 'Edit templates, branding, paper formats.', true),

  // Official circulars
  def('circulars.issue', 'Communication', 'Issue official circulars under letterhead.', true),

  // Cross-role triage actions
  def('counseling.refer', 'Counseling', 'Refer a student to counseling (creates triage case).'),
  def('facilities.report_issue', 'Facilities', 'Report a facilities/classroom issue (triage work order).'),

  // Audit
  def('audit.view', 'Audit', 'View audit logs.'),
  def('audit.export', 'Audit', 'Export audit logs.', true),

  // ── Phase 13: functional staff modules ────────────────────────────────────
  // Reduced-projection people reads (name + class/role + contact only — NOT academic/financial/medical).
  def('student_basic_profile.view', 'Students', 'View a student’s basic profile (name, class, contact).'),
  def('staff_basic_profile.view', 'Staff', 'View a staff member’s basic profile (name, role, contact).'),

  // Health (School Nurse). Medical data — sensitive on every write.
  def('health_records.view', 'Health', 'View student health records.'),
  def('health_records.create', 'Health', 'Create student health records.'),
  def('health_records.update', 'Health', 'Edit student health records.', true),
  def('medical_incidents.manage', 'Health', 'Record and manage medical incidents.', true),
  def('medication_logs.manage', 'Health', 'Record and manage medication administration logs.', true),
  def('emergency_contacts.view', 'Health', 'View student emergency contacts.'),
  def('health_reports.view', 'Health', 'View health summary reports.'),

  // Counseling (Counselor). Sensitive notes — read-access is audited.
  def('counseling.view', 'Counseling', 'View counseling notes and sessions.'),
  def('counseling.create', 'Counseling', 'Create counseling notes and sessions.'),
  def('counseling.update', 'Counseling', 'Edit counseling notes and sessions.', true),
  def('counseling_cases.manage', 'Counseling', 'Open, update and close counseling cases.', true),
  def('wellbeing_reports.view', 'Counseling', 'View wellbeing summary reports.'),

  // Labs (Lab Staff).
  def('labs.view', 'Labs', 'View labs overview.'),
  def('labs.manage_inventory', 'Labs', 'Manage lab consumables and inventory.'),
  def('labs.manage_equipment', 'Labs', 'Manage lab equipment.'),
  def('labs.view_schedule', 'Labs', 'View lab usage schedule.'),
  def('labs.report_incidents', 'Labs', 'Report lab safety incidents.'),

  // Front Desk (Receptionist; visitor logs also read by Security).
  def('visitors.view', 'Front Desk', 'View the visitor log.'),
  def('visitors.manage', 'Front Desk', 'Check visitors in and out.'),
  def('appointments.manage', 'Front Desk', 'Manage front-desk appointments.'),

  // Facilities (Maintenance Staff).
  def('facilities.view', 'Facilities', 'View facilities.'),
  def('work_orders.manage', 'Facilities', 'Create and manage work orders.'),
  def('maintenance_tasks.manage', 'Facilities', 'Manage scheduled maintenance tasks.'),
  def('assets.view', 'Facilities', 'View facility assets.'),
  def('inventory.request', 'Facilities', 'Request inventory / supplies.'),

  // Security (Security Staff).
  def('gate_passes.manage', 'Security', 'Issue and manage gate passes.'),
  def('security_incidents.manage', 'Security', 'Record and manage security incidents.', true),
  def('emergency_alerts.view', 'Security', 'View emergency alerts.'),
  def('campus_access_logs.view', 'Security', 'View campus access logs.'),

  // IT (IT Staff).
  def('devices.manage', 'IT', 'Register and manage devices.'),
  def('users.reset_security', 'IT', 'Reset a user’s security (force re-auth, clear lockout).', true),
  def('users.revoke_sessions', 'IT', 'Revoke a user’s active sessions.', true),
  def('access_requests.manage', 'IT', 'Triage and resolve access requests.'),
  def('integrations.view', 'IT', 'View configured integrations.'),
  def('security_events.view_limited', 'IT', 'View a limited security-events feed.'),

  // Attendance — front-desk check-in/out (shared Attendance group).
  def('attendance.check_in_out', 'Attendance', 'Check students/staff in and out at the front desk.'),

  // Parent Portal — staff-side counterparts of the guardian-facing features.
  def('parent_comm.notices.manage', 'Parent Portal', 'Compose and publish parent notices.'),
  def('parent_comm.consents.manage', 'Parent Portal', 'Create consent forms and view responses.'),
  def('parent_comm.ptm.manage', 'Parent Portal', 'Manage parent-teacher meetings and slots.'),
  def('parent_comm.messages.respond', 'Parent Portal', 'Read and reply to parent message threads.'),
  def('parent_comm.emergency.send', 'Parent Portal', 'Send emergency broadcasts to guardians.', true),
  def('attendance.absence_notes.review', 'Attendance', 'Review guardian-submitted absence notes.'),
  def('students.behavior.manage', 'Students', 'Record and publish behaviour incidents to guardians.', true),
  def('students.recognitions.manage', 'Students', 'Award student recognitions.'),
  def('students.documents.manage', 'Students', 'Publish student documents and fulfil certificate requests.'),
  def('students.profile_changes.review', 'Students', 'Approve or reject guardian profile-change requests.'),
  def('counseling.disclosure.manage', 'Wellbeing', 'Disclose or revoke counselor contact to guardians.', true),
  def('frontdesk.pickup.verify', 'Front Desk', 'Verify guardian pickup authorizations.'),
  def('frontdesk.gate.manage', 'Front Desk', 'Approve early-leave and record gate exit/entry events.'),
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
