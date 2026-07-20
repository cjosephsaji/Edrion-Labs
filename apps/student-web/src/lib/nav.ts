import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BookOpen,
  Calendar,
  FlaskConical,
  GraduationCap,
  History,
  Home,
  Library,
  Settings,
  Sparkles,
  Trophy,
  ClipboardList,
} from 'lucide-react';

export type NavItem = {
  key?: string;
  href: string;
  label: string;
  icon: LucideIcon;
  sparkle?: boolean;
  surfaceKey?: string;
};

const MODULE_ROUTES: Record<string, string> = {
  timetable:'/calendar', attendance:'/analytics', results:'/report-cards', registration:'/courses', exam_prep:'/lab/mock-exams', fees:'/fees', documents:'/documents', transport:'/transport', hostel:'/hostel', campus_library:'/library', health:'/home', id_card:'/settings', diary:'/homework', clubs:'/calendar', events:'/calendar', placements:'/progress', grievance:'/requests', announcements:'/home', learn:'/learn', library:'/library', lab:'/lab', planner:'/calendar', progress:'/progress',
};

export function configNav(modules: Array<{ key: string; label: string }>): NavItem[] {
  return modules.map((module) => ({ key: module.key, href: MODULE_ROUTES[module.key] ?? '/home', label: module.label, icon: BookOpen }));
}

export const coreNav: NavItem[] = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/learn', label: 'Learn', icon: Sparkles, sparkle: true },
  { href: '/library', label: 'Library', icon: Library },
  { href: '/lab', label: 'The Lab', icon: FlaskConical },
];

export function institutionalNav(terms: { hw: string; unitP: string }): NavItem[] {
  return [
    { href: '/homework', label: terms.hw, icon: BookOpen },
    { href: '/classes', label: terms.unitP, icon: GraduationCap },
    { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/calendar', label: 'Calendar', icon: Calendar },
  ];
}

export const youNav: NavItem[] = [
  { href: '/history', label: 'History', icon: History },
  { href: '/achievements', label: 'Achievements', icon: Trophy },
  { href: '/settings', label: 'Settings', icon: Settings },
];

/** Surface-driven nav items — rendered only when me.surfaces[key] is true. */
export const surfaceNav: NavItem[] = [
  { href: '/requests', label: 'My Requests', icon: ClipboardList, surfaceKey: 'requests' },
  { href: '/fees', label: 'Fees', icon: BookOpen, surfaceKey: 'fees' },
  { href: '/transport', label: 'Transport', icon: BookOpen, surfaceKey: 'transport' },
  { href: '/hostel', label: 'Hostel', icon: BookOpen, surfaceKey: 'hostel' },
  { href: '/documents', label: 'Documents', icon: BookOpen, surfaceKey: 'documents' },
];

export function filterSurfaceNav(surfaces: Record<string, boolean> | undefined): NavItem[] {
  if (!surfaces) return [];
  return surfaceNav.filter((item) => item.surfaceKey && surfaces[item.surfaceKey]);
}
