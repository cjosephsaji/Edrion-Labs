'use client';

import Link from 'next/link';
import {
  BookOpen,
  Calculator,
  Clock3,
  FlaskConical,
  Globe2,
  Grid2X2,
  Landmark,
  Languages,
  LibraryBig,
  NotebookTabs,
  type LucideIcon,
} from 'lucide-react';
import styles from './classes.module.css';

export type ClassNavItem = {
  id: string;
  subjectClassId?: string;
  name: string;
  teacherName: string | null;
};

function iconForSubject(name: string): LucideIcon {
  const subject = name.toLowerCase();
  if (subject.includes('math')) return Calculator;
  if (subject.includes('science') || subject.includes('chem') || subject.includes('physics')) return FlaskConical;
  if (subject.includes('history')) return Landmark;
  if (subject.includes('geography')) return Globe2;
  if (subject.includes('hindi') || subject.includes('language')) return Languages;
  return BookOpen;
}

export function SubjectIcon({ name, className }: { name: string; className?: string }) {
  const Icon = iconForSubject(name);
  return <Icon className={className} aria-hidden="true" />;
}

function classHref(item: ClassNavItem) {
  const id = item.subjectClassId ?? item.id;
  const params = new URLSearchParams({ name: item.name });
  if (item.teacherName) params.set('teacher', item.teacherName);
  return `/classes/${id}?${params.toString()}`;
}

export function ClassRail({ items, activeId }: { items: ClassNavItem[]; activeId?: string }) {
  return (
    <aside className={styles.rail} aria-label="Your classes">
      <p className={styles.railLabel}>My classes</p>
      <nav className={styles.railList} aria-label="Subjects">
        {items.map((item) => {
          const itemId = item.subjectClassId ?? item.id;
          const active = itemId === activeId;
          return (
            <Link key={itemId} href={classHref(item)} aria-current={active ? 'page' : undefined} className={styles.railLink}>
              <SubjectIcon name={item.name} className={styles.railIcon} />
              <span>{item.name}</span>
            </Link>
          );
        })}
        <Link href="/classes" aria-current={!activeId ? 'page' : undefined} className={styles.railLink}>
          <Grid2X2 className={styles.railIcon} aria-hidden="true" />
          <span>View all classes</span>
        </Link>
      </nav>

      <div className={styles.railDivider} />
      <p className={styles.railLabel}>Class tools</p>
      <nav className={styles.railList} aria-label="Class tools">
        <Link href="/materials" className={styles.railLink}>
          <LibraryBig className={styles.railIcon} aria-hidden="true" />
          <span>Study materials</span>
        </Link>
        <Link href="/homework" className={styles.railLink}>
          <NotebookTabs className={styles.railIcon} aria-hidden="true" />
          <span>Homework</span>
        </Link>
        <Link href="/timetable" className={styles.railLink}>
          <Clock3 className={styles.railIcon} aria-hidden="true" />
          <span>Timetable</span>
        </Link>
      </nav>
    </aside>
  );
}
