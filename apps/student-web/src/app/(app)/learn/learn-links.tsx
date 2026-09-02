'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Compass, NotebookPen, TrendingUp, type LucideIcon } from 'lucide-react';
import styles from './learn.module.css';

/** Three student-facing rooms. Paths, uploads and saved artifacts are tools inside them. */
export const LEARN_SURFACES: Array<{
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  matches: (pathname: string) => boolean;
}> = [
  {
    href: '/learn',
    label: 'Overview',
    description: 'Continue or start',
    icon: Compass,
    matches: (pathname) => ['/learn', '/petros', '/petros/artifacts'].includes(pathname),
  },
  {
    href: '/materials',
    label: 'Library',
    description: 'Teacher files and uploads',
    icon: BookOpen,
    matches: (pathname) => pathname === '/materials',
  },
  {
    href: '/notes',
    label: 'Notes',
    description: 'Lessons from your teachers',
    icon: NotebookPen,
    matches: (pathname) => pathname === '/notes' || pathname.startsWith('/notes/'),
  },
  {
    href: '/progress',
    label: 'Progress',
    description: 'Next topics and evidence',
    icon: TrendingUp,
    matches: (pathname) => pathname === '/progress' || pathname === '/learning-path',
  },
];

export function LearnCrossLinks() {
  const pathname = usePathname() ?? '';

  return (
    <nav className={styles.crossLinks} aria-label="Learning workspace">
      <span className={styles.crossLabel}>Learn</span>
      {LEARN_SURFACES.map(({ href, label, icon: Icon, matches }) => {
        const active = matches(pathname);
        return <Link
          key={href}
          href={href}
          className={styles.crossLink}
          data-active={active || undefined}
          aria-current={active ? 'page' : undefined}
        >
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </Link>;
      })}
    </nav>
  );
}
