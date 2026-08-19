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

/**
 * `kind` is a storage discriminator ("structured"), not something a student should read,
 * so the row shows what the report card actually says instead.
 */
function publishedLabel(publishedAt?: string | null) {
  if (!publishedAt) return '';
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return '';
  return `Published ${new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)}`;
}

export default function Page() {
  return (
    <ModuleListPage<Row>
      title="Report cards"
      description="Published report cards issued to you."
      path="/student/report-cards"
      queryKey="report-cards"
      emptyTitle="No report cards yet"
      emptyDescription="Report cards appear after your institution publishes them."
      petros={(item) => ({
        entityType: 'report_card',
        entityId: item.id,
        title: String(item.termLabel ?? 'Report card'),
        summary: [item.gpa != null ? `GPA ${item.gpa}` : null, publishedLabel(item.publishedAt)]
          .filter(Boolean)
          .join(' · '),
        href: `/report-cards/${item.id}`,
      })}
      renderItem={(item) => (
        <Link href={`/report-cards/${item.id}`} className="block">
          <SurfaceCard className="transition hover:border-[var(--s-accentBd)]">
            <p className="font-medium text-[var(--s-ink)]">
              {item.termLabel ?? item.kind ?? 'Report card'}
            </p>
            <p className="mt-1 text-xs text-[var(--s-muted)]">
              {[item.gpa != null ? `GPA ${item.gpa}` : '', publishedLabel(item.publishedAt)]
                .filter(Boolean)
                .join(' · ') || 'Published report card'}
            </p>
            <p className="mt-3 text-sm font-semibold text-[var(--s-accentDeep)]">Open report card →</p>
          </SurfaceCard>
        </Link>
      )}
    />
  );
}
