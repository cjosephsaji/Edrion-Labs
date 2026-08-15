'use client';

import { ModuleListPage } from '@/components/module-page';
import { SurfaceCard } from '@/components/ui/states';

type Row = {
  id: string;
  name?: string | number | null; code?: string | number | null; instructorName?: string | number | null
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
      renderItem={(item) => (
        <SurfaceCard>
          <p className="font-medium text-[var(--s-ink)]">{item.name ?? 'Untitled'}</p>
          <p className="mt-1 text-xs text-[var(--s-muted)]">
            {[item.code ?? '', item.instructorName ?? ''].filter(Boolean).join(' · ') || '—'}
          </p>
        </SurfaceCard>
      )}
    />
  );
}
