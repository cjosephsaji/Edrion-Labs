'use client';

import Link from 'next/link';
import { ModuleListPage } from '@/components/module-page';
import { SurfaceCard } from '@/components/ui/states';

type Row = {
  id: string;
  termLabel?: string | null;
  kind?: string | null;
  publishedAt?: string | null;
  gpa?: number | null;
};

export default function Page() {
  return (
    <ModuleListPage<Row>
      title="Report cards"
      description="Published report cards issued to you."
      path="/student/report-cards"
      queryKey="report-cards"
      emptyTitle="No report cards yet"
      emptyDescription="Report cards appear after your institution publishes them."
      renderItem={(item) => (
        <Link href={`/report-cards/${item.id}`} className="block">
          <SurfaceCard className="transition hover:border-[var(--s-accentBd)]">
            <p className="font-medium text-[var(--s-ink)]">
              {item.termLabel ?? item.kind ?? 'Report card'}
            </p>
            <p className="mt-1 text-xs text-[var(--s-muted)]">
              {[
                item.kind,
                item.gpa != null ? `GPA ${item.gpa}` : '',
                item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : '',
              ]
                .filter(Boolean)
                .join(' · ') || '—'}
            </p>
          </SurfaceCard>
        </Link>
      )}
    />
  );
}
