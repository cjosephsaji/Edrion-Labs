'use client';

import { ModuleListPage } from '@/components/module-page';
import { SurfaceCard } from '@/components/ui/states';

type Row = {
  id: string;
  subjectName?: string | number | null; present?: string | number | null; total?: string | number | null; percentage?: string | number | null
};

export default function Page() {
  return (
    <ModuleListPage<Row>
      title="Attendance"
      description="Subject-wise attendance from recorded sessions."
      path="/student/attendance"
      queryKey="attendance"
      emptyTitle="No attendance recorded yet"
      petros={(item) => ({
        entityType: 'attendance_summary',
        title: String(item.subjectName ?? 'Attendance'),
        summary: [
          `${item.present}/${item.total} sessions`,
          item.percentage == null ? null : `${Math.round(Number(item.percentage))}%`,
        ]
          .filter(Boolean)
          .join(' · '),
        href: '/attendance',
      })}
      emptyDescription={'Attendance appears after staff mark sessions.'}
      renderItem={(item) => (
        <SurfaceCard>
          <p className="font-medium text-[var(--s-ink)]">{item.subjectName ?? 'Untitled'}</p>
          <p className="mt-1 text-xs text-[var(--s-muted)]">
            {[`${item.present}/${item.total}`, item.percentage == null ? '' : `${Math.round(Number(item.percentage))}%`].filter(Boolean).join(' · ') || '—'}
          </p>
        </SurfaceCard>
      )}
    />
  );
}
