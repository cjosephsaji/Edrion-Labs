'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Library,
  MessageCircle,
  NotebookPen,
  PanelsTopLeft,
} from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './learning-workspace-frame.module.css';

const learningNavigation = [
  { href: '/learn', label: 'Learn', icon: PanelsTopLeft },
  { href: '/materials', label: 'Library', icon: Library },
  { href: '/notes', label: 'Notes', icon: NotebookPen },
  { href: '/flashcards', label: 'Flashcards', icon: BookOpen },
  { href: '/progress', label: 'Progress', icon: BarChart3 },
] as const;

export function isLearningWorkspaceRoute(pathname: string) {
  // Dedicated studios supply their own navigation. Keep the portal's
  // permissions and saved quick links on the other student pages.
  return pathname === '/petros/document' || pathname === '/petros/pilot';
}

function isStudyRoute(pathname: string) {
  return pathname === '/petros/document' || pathname === '/petros/session' || pathname === '/petros/pilot';
}

export function LearningWorkspaceFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const study = isStudyRoute(pathname);
  if (study) {
    return (
      <div className={styles.studyFrame} data-learning-workspace="study">
        {children}
      </div>
    );
  }
  return (
    <div className={styles.frame} data-learning-workspace="browse">
      <header className={styles.header}>
        <div className={styles.brandRow}>
          <Link href="/home" className={styles.exit} aria-label="Back to student portal">
            <ArrowLeft aria-hidden="true" />
            <span>Portal</span>
          </Link>
          <Link href="/learn" className={styles.brand}>
            <span className={styles.brandMark}>e</span>
            <span><strong>Edrion Learn</strong><small>bright study studio</small></span>
          </Link>
          <Link href="/petros" className={styles.ask} data-current={pathname === '/petros' || undefined}>
            <MessageCircle aria-hidden="true" />
            Ask Petros
          </Link>
        </div>
        <nav className={styles.nav} aria-label="Learning workspace">
          {learningNavigation.map(({ href, label, icon: Icon }) => {
            const active = pathname === href ||
              (href === '/notes' && pathname.startsWith('/notes')) ||
              (href === '/learn' && pathname === '/learning-path') ||
              (href === '/flashcards' && pathname === '/petros/artifacts');
            return (
              <Link key={href} href={href} aria-current={active ? 'page' : undefined} data-current={active || undefined}>
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </header>
      <main className={styles.content} data-petros-target={`page:${pathname}`}>
        {children}
      </main>
    </div>
  );
}
