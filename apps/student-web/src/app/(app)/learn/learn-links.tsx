'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Compass, Layers3, Map, Sparkles, TrendingUp, type LucideIcon } from 'lucide-react';
import styles from './learn.module.css';

/**
 * The row that stops the learning pages being islands.
 *
 * Every learning surface renders the same set, minus itself, so a student who lands on any
 * one of them can reach the other five without going back through Explore.
 */
export const LEARN_SURFACES: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/learn', label: 'Learn', icon: Compass },
  { href: '/learning-path', label: 'Learning path', icon: Map },
  { href: '/progress', label: 'Learning progress', icon: TrendingUp },
  { href: '/materials', label: 'Study materials', icon: BookOpen },
  { href: '/petros', label: 'Petros input modes', icon: Sparkles },
  { href: '/petros/artifacts', label: 'Saved artifacts', icon: Layers3 },
];

export function LearnCrossLinks() {
  const pathname = usePathname();
  const links = LEARN_SURFACES.filter((surface) => surface.href !== pathname);

  return (
    <nav className={styles.crossLinks} aria-label="Other learning pages">
      <span className={styles.crossLabel}>Also in learning</span>
      {links.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className={styles.crossLink}>
          <Icon aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
