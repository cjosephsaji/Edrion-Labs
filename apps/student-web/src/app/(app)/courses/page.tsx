'use client';

import { ModuleListPage } from '@/components/module-page';
import { SurfaceCard } from '@/components/ui/states';

type Row = {
  id: string;
  name?: string | number | null;
  code?: string | number | null;
  professorName?: string | number | null;
};

export default function Page() {
  return (
    <ModuleListPage<Row>
      title="Courses"
      description="Courses you are enrolled in."
      path="/student/courses"
      queryKey="courses"
      emptyTitle="No courses enrolled"
      emptyDescription={undefined}
      getItemHref={(item) => {
        const query = new URLSearchParams();
        if (item.name) query.set('name', String(item.name));
        if (item.code) query.set('code', String(item.code));
        if (item.professorName) query.set('professor', String(item.professorName));
        return `/courses/${item.id}${query.size ? `?${query.toString()}` : ''}`;
      }}
      renderItem={(item) => (
        <SurfaceCard className="transition hover:-translate-y-0.5 hover:border-[var(--s-accentBd)] hover:shadow-[0_14px_34px_rgb(24_55_45_/_9%)]">
          <p className="font-medium text-[var(--s-ink)]">{item.name ?? 'Untitled'}</p>
          <p className="mt-1 text-xs text-[var(--s-muted)]">
            {[item.code ?? '', item.professorName ?? ''].filter(Boolean).join(' · ') || '—'}
          </p>
          <p className="mt-4 text-sm font-semibold text-[var(--s-accentDeep)]">Open course →</p>
        </SurfaceCard>
      )}
    />
  );
}
