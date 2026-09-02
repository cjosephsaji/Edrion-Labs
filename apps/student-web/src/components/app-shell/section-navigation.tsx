'use client';

import Link from 'next/link';
import {
  BedDouble,
  Bell,
  BookOpen,
  BusFront,
  CalendarCheck,
  CalendarDays,
  ChartNoAxesColumn,
  ClipboardCheck,
  Compass,
  ConciergeBell,
  FileBadge,
  FilePenLine,
  Files,
  GraduationCap,
  Megaphone,
  NotebookPen,
  School,
  Settings,
  TrendingUp,
  UserRound,
  CreditCard,
  type LucideIcon,
} from 'lucide-react';
import type { NavItem, NavSection } from '@/lib/nav';
import styles from './section-navigation.module.css';

const ICONS: Record<string, LucideIcon> = {
  '/timetable': CalendarCheck,
  '/attendance': ClipboardCheck,
  '/classes': School,
  '/courses': GraduationCap,
  '/calendar': CalendarDays,
  '/learn': Compass,
  '/materials': BookOpen,
  '/notes': NotebookPen,
  '/flashcards': CreditCard,
  '/progress': TrendingUp,
  '/assignments': FilePenLine,
  '/homework': NotebookPen,
  '/exams': CalendarCheck,
  '/results': ChartNoAxesColumn,
  '/report-cards': FileBadge,
  '/announcements': Megaphone,
  '/notifications': Bell,
  '/requests': ConciergeBell,
  '/documents': Files,
  '/transport': BusFront,
  '/hostel': BedDouble,
  '/profile': UserRound,
  '/settings': Settings,
};

/** Hidden tools belong to a visible room rather than becoming extra navigation items. */
const ROUTE_ALIASES: Array<{ test: (pathname: string) => boolean; href: string }> = [
  { test: (pathname) => pathname === '/learning-path', href: '/progress' },
  { test: (pathname) => pathname === '/petros' || pathname === '/petros/artifacts', href: '/learn' },
  // College navigation presents authored homework/classwork inside Assignments. School navigation
  // still resolves /homework directly before this fallback is considered.
  { test: (pathname) => pathname === '/homework' || pathname.startsWith('/homework/'), href: '/assignments' },
];

function directItem(pathname: string, sections: NavSection[]) {
  return sections
    .flatMap((section) => section.items)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0];
}

export function activeSectionNavigation(pathname: string, sections: NavSection[]) {
  // A live lesson keeps its own compact session controls. Portal sibling links would compete
  // with Save and pause, so this is the one ordinary-shell route without a section row.
  if (pathname.startsWith('/petros/session')) return null;
  const href = directItem(pathname, sections)?.href
    ?? ROUTE_ALIASES.find((alias) => alias.test(pathname))?.href;
  if (!href) return null;
  const section = sections.find((candidate) => candidate.items.some((item) => item.href === href));
  if (!section || section.items.length < 2) return null;
  return { section, activeHref: href };
}

export function SectionNavigation({
  section,
  activeHref,
}: {
  section: NavSection;
  activeHref: string;
}) {
  return (
    <nav className={styles.nav} aria-label={`${section.label} navigation`}>
      <span className={styles.label}>{section.label}</span>
      {section.items.map((item: NavItem) => {
        const Icon = ICONS[item.href] ?? Compass;
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={styles.link}
            data-active={active || undefined}
            aria-current={active ? 'page' : undefined}
          >
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
