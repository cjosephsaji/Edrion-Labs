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
  UserSquare2,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Minimum permission to see this item; hidden if the user lacks it. */
  permission: string;
}

export interface NavGroup {
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
    label: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permission: 'portal.dashboard.view' },
      { label: 'Attention Centre', href: '/attention', icon: Gauge, permission: 'portal.dashboard.view' },
      { label: 'AI Copilot', href: '/copilot', icon: Sparkles, permission: 'ai.use' },
    ],
  },
  {
    label: 'Academic Setup',
    items: [
      { label: 'Academic Years', href: '/academics/years', icon: CalendarRange, permission: 'academics.view' },
      { label: 'Departments', href: '/academics/departments', icon: Building2, permission: 'academics.view' },
      { label: 'Grades', href: '/academics/grades', icon: Layers3, permission: 'academics.view' },
      { label: 'Subjects', href: '/academics/subjects', icon: BookOpen, permission: 'academics.view' },
      { label: 'Classes', href: '/academics/classes', icon: School, permission: 'academics.view' },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'Students', href: '/students', icon: GraduationCap, permission: 'students.view' },
      { label: 'Student Conduct', href: '/conduct', icon: ShieldAlert, permission: 'student_conduct.view' },
      { label: 'Teachers', href: '/teachers', icon: UserSquare2, permission: 'teachers.view' },
      { label: 'Staff', href: '/staff', icon: Users, permission: 'staff.view' },
      { label: 'Parents', href: '/parents', icon: Users, permission: 'parents.view' },
    ],
  },
  {
    label: 'Academics',
    items: [
      { label: 'Admissions', href: '/admissions', icon: ClipboardList, permission: 'admissions.view' },
      { label: 'Attendance', href: '/attendance', icon: ClipboardCheck, permission: 'attendance.view' },
      { label: 'Timetable', href: '/timetable', icon: CalendarDays, permission: 'timetable.view' },
      { label: 'Exams', href: '/exams', icon: FileBarChart, permission: 'exams.view' },
      { label: 'Gradebook', href: '/gradebook', icon: BookOpen, permission: 'gradebook.view' },
      { label: 'Assignments', href: '/assignments', icon: ClipboardList, permission: 'assignments.view' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Fees', href: '/fees', icon: Coins, permission: 'fees.view' },
      { label: 'Expenses', href: '/expenses', icon: Receipt, permission: 'expenses.view' },
      { label: 'Payroll', href: '/payroll', icon: Wallet, permission: 'payroll.view' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Library', href: '/library', icon: Library, permission: 'library.view' },
      { label: 'Transport', href: '/transport', icon: Bus, permission: 'transport.view' },
      { label: 'Inventory', href: '/inventory', icon: Package, permission: 'inventory.view' },
      { label: 'Hostel', href: '/hostel', icon: School, permission: 'hostel.view' },
    ],
  },
  {
    label: 'Communication',
    items: [
      { label: 'Announcements', href: '/announcements', icon: Megaphone, permission: 'announcements.view' },
      { label: 'Notifications', href: '/notifications', icon: Bell, permission: 'announcements.view' },
      { label: 'Messages', href: '/messages', icon: MessageSquare, permission: 'messages.use' },
    ],
  },
  {
    label: 'Health & Wellbeing',
    items: [
      { label: 'Health Records', href: '/health', icon: HeartPulse, permission: 'health_records.view' },
      { label: 'Medical Incidents', href: '/health/incidents', icon: Stethoscope, permission: 'medical_incidents.manage' },
      { label: 'Medication Logs', href: '/health/medications', icon: Pill, permission: 'medication_logs.manage' },
      { label: 'Counseling', href: '/counseling', icon: HeartHandshake, permission: 'counseling.view' },
      { label: 'Counseling Cases', href: '/counseling/cases', icon: FolderKanban, permission: 'counseling_cases.manage' },
    ],
  },
  {
    label: 'Campus Operations',
    items: [
      { label: 'Labs', href: '/labs', icon: FlaskConical, permission: 'labs.view' },
      { label: 'Lab Schedule', href: '/labs/schedule', icon: CalendarClock, permission: 'labs.view_schedule' },
      { label: 'Lab Incidents', href: '/labs/incidents', icon: TriangleAlert, permission: 'labs.view' },
      { label: 'Front Desk', href: '/front-desk', icon: ConciergeBell, permission: 'visitors.view' },
      { label: 'Appointments', href: '/front-desk/appointments', icon: CalendarCheck, permission: 'appointments.manage' },
      { label: 'Facilities', href: '/facilities', icon: Wrench, permission: 'facilities.view' },
      { label: 'Work Orders', href: '/facilities/work-orders', icon: ClipboardList, permission: 'work_orders.manage' },
      { label: 'Maintenance', href: '/facilities/maintenance', icon: Hammer, permission: 'maintenance_tasks.manage' },
      { label: 'Assets', href: '/facilities/assets', icon: Boxes, permission: 'assets.view' },
      { label: 'Visitor Logs', href: '/security', icon: ShieldCheck, permission: 'campus_access_logs.view' },
      { label: 'Gate Passes', href: '/security/gate-passes', icon: Ticket, permission: 'gate_passes.manage' },
      { label: 'Security Incidents', href: '/security/incidents', icon: ShieldAlert, permission: 'security_incidents.manage' },
      { label: 'Emergency Alerts', href: '/security/alerts', icon: Siren, permission: 'emergency_alerts.view' },
      { label: 'Access Logs', href: '/security/access-logs', icon: DoorOpen, permission: 'campus_access_logs.view' },
    ],
  },
  {
    label: 'IT',
    items: [
      { label: 'Devices', href: '/it', icon: Laptop, permission: 'devices.manage' },
      { label: 'Access Requests', href: '/it/access-requests', icon: KeyRound, permission: 'access_requests.manage' },
    ],
  },
  {
    label: 'Insights',
    items: [{ label: 'Reports', href: '/reports', icon: FileBarChart, permission: 'reports.view' }],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Campuses', href: '/campuses', icon: School, permission: 'campuses.view' },
      { label: 'Documents & Policies', href: '/documents', icon: FileText, permission: 'documents.view' },
      { label: 'User Management', href: '/users', icon: UserCog, permission: 'users.view' },
      { label: 'Roles & Permissions', href: '/roles', icon: ShieldCheck, permission: 'roles.view' },
      { label: 'Settings', href: '/settings', icon: Settings, permission: 'institution_settings.view' },
      { label: 'Billing', href: '/billing', icon: CreditCard, permission: 'billing.view' },
      { label: 'Audit Logs', href: '/audit', icon: ShieldCheck, permission: 'audit.view' },
    ],
  },
];
