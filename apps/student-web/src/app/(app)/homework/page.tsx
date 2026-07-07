'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { HomeworkListItemDto } from '@edrion/schemas';
import { useHomeworkList, useStudentMe } from '@/lib/hooks';
import { useStudentTerm } from '@/lib/persona';
import { GovernancePill } from '@/components/institutional/GovernancePill';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader, PillChip } from '@/components/ui/primitives';

const FILTERS = ['all', 'progress', 'submitted', 'returned'] as const;

export default function HomeworkPage() {
  const router = useRouter();
  const { data: me } = useStudentMe();
  const terms = useStudentTerm();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const { data, isLoading } = useHomeworkList(filter);

  useEffect(() => {
    if (me?.persona === 'college') router.replace('/assignments');
  }, [me?.persona, router]);

  if (me?.persona === 'college') return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        eyebrow={<Eyebrow>{terms.instLabel}</Eyebrow>}
        title={terms.hw}
        subtitle="Due dates, status, and your answers — all in one place."
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <PillChip key={f} variant={filter === f ? 'primary' : 'default'} onClick={() => setFilter(f)}>
            {f}
          </PillChip>
        ))}
      </div>

      {isLoading ? (
        <div className="mt-8 h-32 shimmer rounded-[15px]" />
      ) : (data?.items ?? []).length === 0 ? (
        <EmptyState
          className="mt-8"
          eyebrow="NO HOMEWORK"
          title={filter === 'all' ? 'No homework yet' : `Nothing ${filter.replace('_', ' ')}`}
          description={
            filter === 'all'
              ? 'When your teacher assigns work, it will appear here.'
              : 'Try another filter to see other assignments.'
          }
        />
      ) : (
        <div className="mt-6 space-y-2">
          {((data?.items ?? []) as HomeworkListItemDto[]).map((item) => (
            <Link key={item.id} href={`/homework/${item.id}`}>
              <div className="flex items-center gap-4 rounded-[15px] border border-st-bd1 bg-st-card px-4 py-3.5 transition hover:border-st-accent/40">
                <div className="w-16 shrink-0 font-mono-ui text-[10.5px] font-medium leading-snug text-st-faint">
                  {item.dueLabel.split(' ').slice(0, 2).join('\n')}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-st-ink">{item.title}</p>
                  <p className="text-xs text-st-muted">
                    {item.subjectLabel} · {item.teacherName}
                  </p>
                  <p className="mt-1 text-xs text-st-faint">
                    {item.answeredCount}/{item.questionCount} answered
                    {item.late && ' · Late'}
                  </p>
                </div>
                <GovernancePill label={item.badge.label} tone={item.badge.tone} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
