/**
 * Institutional → student navigation map.
 * Only modules backed by existing institution portal / DB surfaces are listed.
 */
export type NavItem = {
  href: string;
  label: string;
  /** Student permission key required (when authenticated). */
  permission?: string;
  /** Surface flag key consulted via SurfaceGateService when present. */
  surface?: string;
};

export type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

export const STUDENT_NAV: NavSection[] = [
  {
    id: 'home',
    label: 'Home',
    items: [{ href: '/home', label: 'Dashboard' }],
  },
  {
    id: 'academics',
    label: 'Academics',
    items: [
      { href: '/timetable', label: 'Timetable', permission: 'student.classes.view' },
      { href: '/attendance', label: 'Attendance', permission: 'student.attendance.view' },
      { href: '/classes', label: 'Classes', permission: 'student.classes.view' },
      { href: '/courses', label: 'Courses', permission: 'student.courses.view' },
      { href: '/calendar', label: 'Calendar', permission: 'student.calendar.view' },
    ],
  },
  {
    id: 'learning',
    label: 'Learning',
    items: [
      { href: '/assignments', label: 'Assignments', permission: 'student.assignments.view' },
      { href: '/homework', label: 'Homework', permission: 'student.homework.view' },
      { href: '/materials', label: 'Study materials', permission: 'student.classes.view' },
      { href: '/learning-path', label: 'Learning path', permission: 'student.learn.use' },
      { href: '/progress', label: 'Learning progress', permission: 'student.learn.use' },
      { href: '/petros', label: 'Petros input modes', permission: 'student.learn.use' },
    ],
  },
  {
    id: 'assessments',
    label: 'Assessments',
    items: [
      { href: '/exams', label: 'Examinations', permission: 'student.exams.view' },
      {
        href: '/results',
        label: 'Results',
        permission: 'student.surface.results.view',
        surface: 'results',
      },
      { href: '/report-cards', label: 'Report cards', permission: 'student.report_cards.view' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      {
        href: '/fees',
        label: 'Fees',
        permission: 'student.surface.fees.view',
        surface: 'fees',
      },
    ],
  },
  {
    id: 'communication',
    label: 'Communication',
    items: [
      { href: '/announcements', label: 'Announcements' },
      { href: '/notifications', label: 'Notifications' },
    ],
  },
  {
    id: 'services',
    label: 'Services',
    items: [
      {
        href: '/requests',
        label: 'Requests',
        permission: 'student.surface.requests.view',
        surface: 'requests',
      },
      {
        href: '/documents',
        label: 'Documents',
        permission: 'student.surface.documents.view',
        surface: 'documents',
      },
      {
        href: '/transport',
        label: 'Transport',
        permission: 'student.surface.transport.view',
        surface: 'transport',
      },
      {
        href: '/hostel',
        label: 'Hostel',
        permission: 'student.surface.hostel.view',
        surface: 'hostel',
      },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      { href: '/profile', label: 'Profile' },
      { href: '/settings', label: 'Settings', permission: 'student.settings.manage' },
    ],
  },
];

/** Admin action → student view mapping (for docs / QA). */
export const INSTITUTION_TO_STUDENT: Array<{ admin: string; student: string; gate: string }> = [
  {
    admin: 'Creates / publishes assignment',
    student: 'View + submit at /assignments',
    gate: 'assignments.status = published',
  },
  {
    admin: 'Creates / publishes homework',
    student: 'View + submit at /homework',
    gate: 'homework status + assignees',
  },
  {
    admin: 'Records attendance',
    student: 'Read-only summary at /attendance',
    gate: 'attendance_records + rollups',
  },
  {
    admin: 'Publishes timetable slots',
    student: 'View at /timetable',
    gate: 'class / enrolment match',
  },
  {
    admin: 'Releases marks / report cards',
    student: 'View at /results and /report-cards',
    gate: 'published / released only',
  },
  {
    admin: 'Creates fee invoice',
    student: 'View dues / receipts at /fees',
    gate: 'invoice not cancelled + surface',
  },
  {
    admin: 'Publishes announcement',
    student: 'Inbox at /announcements',
    gate: 'status=published + audience',
  },
  {
    admin: 'Uploads class materials',
    student: 'Access at /materials',
    gate: 'class membership',
  },
  {
    admin: 'Approves student request',
    student: 'Status at /requests',
    gate: 'own student_requests rows',
  },
  {
    admin: 'Issues certificate to vault',
    student: 'Download at /documents',
    gate: 'vault ownership + surface',
  },
];
