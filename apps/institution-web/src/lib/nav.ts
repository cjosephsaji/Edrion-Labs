import {
  BookOpen,
  Building2,
  Bus,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Coins,
  FileBarChart,
  GraduationCap,
  Bell,
  Layers3,
  LayoutDashboard,
  Library,
  Megaphone,
  MessageSquare,
  Package,
  School,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  UserCog,
  UserSquare2,
  Wallet,
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
    label: 'Insights',
    items: [{ label: 'Reports', href: '/reports', icon: FileBarChart, permission: 'reports.view' }],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Campuses', href: '/campuses', icon: School, permission: 'campuses.view' },
      { label: 'User Management', href: '/users', icon: UserCog, permission: 'users.view' },
      { label: 'Roles & Permissions', href: '/roles', icon: ShieldCheck, permission: 'roles.view' },
      { label: 'Settings', href: '/settings', icon: Settings, permission: 'institution_settings.view' },
      { label: 'Audit Logs', href: '/audit', icon: ShieldCheck, permission: 'audit.view' },
    ],
  },
];
