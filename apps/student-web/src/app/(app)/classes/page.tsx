'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { ClassRail, SubjectIcon, type ClassNavItem } from '@/components/classes/class-rail';
import styles from '@/components/classes/classes.module.css';
import { PageHeader } from '@/components/design-system';
import { EmptyState, ErrorState, LoadingBlock, UnauthorizedState } from '@/components/ui/states';
import { StudentApiError, formatApiError } from '@/lib/api-client';
import { useStudentList, useStudentMe } from '@/lib/hooks';

type ClassRow = ClassNavItem & {
  initial?: string;
  nextMeta: string | null;
  liveToday: boolean;
};

function classHref(row: ClassRow) {
  const params = new URLSearchParams({ name: row.name });
  if (row.teacherName) params.set('teacher', row.teacherName);
  return `/classes/${row.subjectClassId ?? row.id}?${params.toString()}`;
}

export default function ClassesPage() {
  const query = useStudentList<{ items: ClassRow[] }>('classes', '/student/classes');
  const { data: me } = useStudentMe();

  if (query.isLoading) return <LoadingBlock label="Loading your classes..." />;
  if (query.error instanceof StudentApiError && query.error.status === 401) return <UnauthorizedState />;
  if (query.error) return <ErrorState description={formatApiError(query.error)} onRetry={() => void query.refetch()} />;

  const rows = query.data?.items ?? [];

  return (
    <div className={styles.workspace}>
      <ClassRail items={rows} />

      <div className={styles.indexContent}>
        <PageHeader
          eyebrow={`Classes · ${me?.className || 'Your school'}`}
          title="Your classes"
          description="Open a subject to find its updates, materials, homework, timetable, and attendance in one place."
        />

        {rows.length === 0 ? (
          <EmptyState icon={BookOpen} title="No classes found" description="Your subjects appear after your class enrolment is published." />
        ) : (
          <div className={styles.classGrid}>
            {rows.map((row, index) => (
              <Link
                key={row.id}
                href={classHref(row)}
                className={`${styles.classCard} animate-block-in focus-ring`}
                style={{ animationDelay: `${Math.min(index * 40, 160)}ms` }}
              >
                <span className={styles.classMark}>
                  <SubjectIcon name={row.name} className={styles.classMarkIcon} />
                </span>
                <span className={styles.classCardBody}>
                  <span className={styles.classCardTop}>
                    <span className={styles.classCardTitle}>{row.name}</span>
                    {row.liveToday ? <span className={styles.todayBadge}>Today</span> : null}
                  </span>
                  <span className={styles.classCardMeta}>
                    {[row.teacherName, row.nextMeta || 'Schedule available in Timetable'].filter(Boolean).join(' · ')}
                  </span>
                  <span className={styles.classCardAction}>Open class <ArrowRight aria-hidden="true" /></span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
