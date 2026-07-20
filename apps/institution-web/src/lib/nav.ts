import {
  BookOpen,
  Boxes,
  Building2,
  Bus,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Coins,
  ConciergeBell,
  DoorOpen,
  FileBarChart,
  FileText,
  FlaskConical,
  FolderKanban,
  GitBranch,
  GraduationCap,
  Hammer,
  HeartHandshake,
  HeartPulse,
  Bell,
  KeyRound,
  Laptop,
  Layers3,
  LayoutDashboard,
  CreditCard,
  Library,
  Megaphone,
  MessageSquare,
  Package,
  Pill,
  Receipt,
  School,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  Gauge,
  Stethoscope,
  Ticket,
  TriangleAlert,
  Users,
  UserCog,
  Wallet,
  Wrench,
  Inbox,
  type LucideIcon,
} from 'lucide-react';
import type { InstitutionType } from '@edrion/shared-types';

export interface NavItem {
  /** Stable id for layout prefs (reorder / rename). */
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Minimum permission to see this item; hidden if the user lacks it. */
  permission: string;
  /** When set, the sidebar resolves the label via useTerm() instead of the static label. */
  termKey?: import('@edrion/shared-types').TermKey;
  /** Use plural form when true (default singular). */
  termPlural?: boolean;
  /** When set, only show for these institution types (e.g. hide programme structure from schools). */
  institutionTypes?: InstitutionType[];
}

export interface NavGroup {
  /** Stable id for layout prefs (reorder / rename). */
  id: string;
  label: string;
  items: NavItem[];
}

/**
 * Institution Portal navigation — the full module map. Items are filtered by permission at
 * render, so each role sees only what it can use. Routes not yet built render a "coming soon"
 * placeholder (the catch-all page) rather than a 404.
 */
export const NAV: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permission: 'portal.dashboard.view' },
      { id: 'attention', label: 'Attention Centre', href: '/attention', icon: Gauge, permission: 'portal.dashboard.view' },
      { id: 'petros', label: 'Petros', href: '/petros', icon: Sparkles, permission: 'ai.use' },
    ],
  },
  {
    id: 'workflow',
    label: 'Workflow',
    items: [
      { id: 'approvals', label: 'Approvals', href: '/approvals', icon: Inbox, permission: 'requests.review' },
    ],
  },
  {
    id: 'academic-setup',
    label: 'Academic Setup',
    items: [
      { id: 'academics-years', label: 'Academic Years', href: '/academics/years', icon: CalendarRange, permission: 'academics.view', termKey: 'academicYear', termPlural: true },
      { id: 'academics-departments', label: 'Departments', href: '/academics/departments', icon: Building2, permission: 'academics.view', termKey: 'department', termPlural: true },
      {
        id: 'academics-programme-structure',
        label: 'Programme Structure',
        href: '/academics/programme-structure',
        icon: GitBranch,
        permission: 'academics.view',
        termKey: 'programmeStructure',
        institutionTypes: ['college', 'university', 'training_center'],
      },
      { id: 'academics-grades', label: 'Grades', href: '/academics/grades', icon: Layers3, permission: 'academics.view', termKey: 'gradeLevel', termPlural: true, institutionTypes: ['school'] },
      { id: 'academics-subjects', label: 'Subjects', href: '/academics/subjects', icon: BookOpen, permission: 'academics.view', termKey: 'subject', termPlural: true },
      { id: 'academics-classes', label: 'Classes', href: '/academics/classes', icon: School, permission: 'academics.view', termKey: 'class', termPlural: true },
      { id: 'academics-terms', label: 'Terms', href: '/academics/terms', icon: CalendarDays, permission: 'academics.view', termKey: 'term', termPlural: true },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      { id: 'students', label: 'Students', href: '/students', icon: GraduationCap, permission: 'students.view', termKey: 'student', termPlural: true },
      { id: 'conduct', label: 'Student Conduct', href: '/conduct', icon: ShieldAlert, permission: 'student_conduct.view' },
      { id: 'staff', label: 'Staff', href: '/staff', icon: Users, permission: 'staff.view', termKey: 'staff', termPlural: true },
      { id: 'parents', label: 'Parents', href: '/parents', icon: Users, permission: 'parents.view' },
    ],
  },
  {
    id: 'academics',
    label: 'Academics',
    items: [
      { id: 'admissions', label: 'Admissions', href: '/admissions', icon: ClipboardList, permission: 'admissions.view', termKey: 'admission', termPlural: true },
      { id: 'attendance', label: 'Attendance', href: '/attendance', icon: ClipboardCheck, permission: 'attendance.view' },
      { id: 'timetable', label: 'Timetable', href: '/timetable', icon: CalendarDays, permission: 'timetable.view' },
      { id: 'homework', label: 'Homework', href: '/homework', icon: ClipboardList, permission: 'homework.manage', institutionTypes: ['school'] },
      { id: 'class-content', label: 'Class content', href: '/class-content', icon: Megaphone, permission: 'class_content.manage' },
      { id: 'courses', label: 'Courses', href: '/courses', icon: BookOpen, permission: 'courses.manage', institutionTypes: ['college', 'university', 'training_center'] },
      { id: 'exams', label: 'Exams', href: '/exams', icon: FileBarChart, permission: 'exams.view' },
      { id: 'gradebook', label: 'Gradebook', href: '/gradebook', icon: BookOpen, permission: 'gradebook.view' },
      { id: 'report-cards', label: 'Report cards', href: '/report-cards', icon: FileText, permission: 'report_cards.view' },
      { id: 'assignments', label: 'Assignments', href: '/assignments', icon: ClipboardList, permission: 'assignments.view' },
      { id: 'calendar', label: 'Calendar', href: '/calendar', icon: CalendarDays, permission: 'calendar_events.view' },
      { id: 'calendar-events', label: 'Calendar events', href: '/calendar-events', icon: CalendarDays, permission: 'calendar_events.manage' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      { id: 'fees', label: 'Fees', href: '/fees', icon: Coins, permission: 'fees.view' },
      { id: 'expenses', label: 'Expenses', href: '/expenses', icon: Receipt, permission: 'expenses.view' },
      { id: 'payroll', label: 'Payroll', href: '/payroll', icon: Wallet, permission: 'payroll.view' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { id: 'library', label: 'Library', href: '/library', icon: Library, permission: 'library.view' },
      { id: 'transport', label: 'Transport', href: '/transport', icon: Bus, permission: 'transport.view' },
      { id: 'inventory', label: 'Inventory', href: '/inventory', icon: Package, permission: 'inventory.view' },
      { id: 'hostel', label: 'Hostel', href: '/hostel', icon: School, permission: 'hostel.view' },
    ],
  },
  {
    id: 'communication',
    label: 'Communication',
    items: [
      { id: 'announcements', label: 'Announcements', href: '/announcements', icon: Megaphone, permission: 'announcements.view' },
      { id: 'notifications', label: 'Notifications', href: '/notifications', icon: Bell, permission: 'announcements.view' },
      { id: 'messages', label: 'Messages', href: '/messages', icon: MessageSquare, permission: 'messages.use' },
    ],
  },
  {
    id: 'health-wellbeing',
    label: 'Health & Wellbeing',
    items: [
      { id: 'health', label: 'Health Records', href: '/health', icon: HeartPulse, permission: 'health_records.view' },
      { id: 'health-incidents', label: 'Medical Incidents', href: '/health/incidents', icon: Stethoscope, permission: 'medical_incidents.manage' },
      { id: 'health-medications', label: 'Medication Logs', href: '/health/medications', icon: Pill, permission: 'medication_logs.manage' },
      { id: 'counseling', label: 'Counseling', href: '/counseling', icon: HeartHandshake, permission: 'counseling.view' },
      { id: 'counseling-cases', label: 'Counseling Cases', href: '/counseling/cases', icon: FolderKanban, permission: 'counseling_cases.manage' },
    ],
  },
  {
    id: 'campus-operations',
    label: 'Campus Operations',
    items: [
      { id: 'labs', label: 'Labs', href: '/labs', icon: FlaskConical, permission: 'labs.view' },
      { id: 'labs-schedule', label: 'Lab Schedule', href: '/labs/schedule', icon: CalendarClock, permission: 'labs.view_schedule' },
      { id: 'labs-incidents', label: 'Lab Incidents', href: '/labs/incidents', icon: TriangleAlert, permission: 'labs.view' },
      { id: 'front-desk', label: 'Front Desk', href: '/front-desk', icon: ConciergeBell, permission: 'visitors.view' },
      { id: 'front-desk-appointments', label: 'Appointments', href: '/front-desk/appointments', icon: CalendarCheck, permission: 'appointments.manage' },
      { id: 'facilities', label: 'Facilities', href: '/facilities', icon: Wrench, permission: 'facilities.view' },
      { id: 'facilities-work-orders', label: 'Work Orders', href: '/facilities/work-orders', icon: ClipboardList, permission: 'work_orders.manage' },
      { id: 'facilities-maintenance', label: 'Maintenance', href: '/facilities/maintenance', icon: Hammer, permission: 'maintenance_tasks.manage' },
      { id: 'facilities-assets', label: 'Assets', href: '/facilities/assets', icon: Boxes, permission: 'assets.view' },
      { id: 'security', label: 'Visitor Logs', href: '/security', icon: ShieldCheck, permission: 'campus_access_logs.view' },
      { id: 'security-gate-passes', label: 'Gate Passes', href: '/security/gate-passes', icon: Ticket, permission: 'gate_passes.manage' },
      { id: 'security-incidents', label: 'Security Incidents', href: '/security/incidents', icon: ShieldAlert, permission: 'security_incidents.manage' },
      { id: 'security-alerts', label: 'Emergency Alerts', href: '/security/alerts', icon: Siren, permission: 'emergency_alerts.view' },
      { id: 'security-access-logs', label: 'Access Logs', href: '/security/access-logs', icon: DoorOpen, permission: 'campus_access_logs.view' },
    ],
  },
  {
    id: 'it',
    label: 'IT',
    items: [
      { id: 'it-devices', label: 'Devices', href: '/it', icon: Laptop, permission: 'devices.manage' },
      { id: 'it-access-requests', label: 'Access Requests', href: '/it/access-requests', icon: KeyRound, permission: 'access_requests.manage' },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [{ id: 'reports', label: 'Reports', href: '/reports', icon: FileBarChart, permission: 'reports.view' }],
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [
      { id: 'campuses', label: 'Campuses', href: '/campuses', icon: School, permission: 'campuses.view' },
      { id: 'documents', label: 'Documents & Policies', href: '/documents', icon: FileText, permission: 'documents.view' },
      { id: 'users', label: 'User Management', href: '/users', icon: UserCog, permission: 'users.view' },
      { id: 'roles', label: 'Roles & Permissions', href: '/roles', icon: ShieldCheck, permission: 'roles.view' },
      { id: 'settings', label: 'Settings', href: '/settings', icon: Settings, permission: 'institution_settings.view' },
      { id: 'billing', label: 'Billing', href: '/billing', icon: CreditCard, permission: 'billing.view' },
      { id: 'audit', label: 'Audit Logs', href: '/audit', icon: ShieldCheck, permission: 'audit.view' },
    ],
  },
];

/** Flat lookup of every nav item by stable id. */
export const NAV_ITEMS_BY_ID: Record<string, NavItem> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((item) => [item.id, item])),
);

/** Flat lookup of every nav group by stable id. */
export const NAV_GROUPS_BY_ID: Record<string, NavGroup> = Object.fromEntries(NAV.map((g) => [g.id, g]));

/**
 * Route prefixes where the academic year/term switcher does nothing useful.
 * Year-agnostic config, admin, and cross-year tools — hide rather than show a no-op control.
 */
export const ACADEMIC_SWITCHER_HIDDEN_PREFIXES: string[] = [
  '/academics/departments',
  '/academics/grades',
  '/academics/subjects',
  '/academics/programme-structure',
  '/users',
  '/settings',
  '/roles',
  '/campuses',
  '/billing',
  '/audit',
  '/inventory',
  '/transport',
  '/hostel',
  '/library',
  '/payroll',
  '/onboarding',
];

export function isAcademicSwitcherHidden(pathname: string): boolean {
  return ACADEMIC_SWITCHER_HIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Every portal nav href (flat). */
export const NAV_HREFS: string[] = NAV.flatMap((g) => g.items.map((item) => item.href));

/**
 * Longest-prefix match for the current path so child routes (e.g. /timetable/schedules)
 * highlight only their own nav item, not a shorter parent href (/timetable).
 */
export function resolveActiveNavHref(pathname: string, hrefs: readonly string[] = NAV_HREFS): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (pathname !== href && !pathname.startsWith(`${href}/`)) continue;
    if (!best || href.length > best.length) best = href;
  }
  return best;
}

export function isNavItemActive(
  pathname: string,
  itemHref: string,
  hrefs: readonly string[] = NAV_HREFS,
): boolean {
  return resolveActiveNavHref(pathname, hrefs) === itemHref;
}
