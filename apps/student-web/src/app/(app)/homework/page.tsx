'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { HomeworkListItemDto } from '@edrion/schemas';
import { useHomeworkList, useStudentMe } from '@/lib/hooks';
import { useStudentTerm } from '@/lib/persona';
import { GovernancePill } from '@/components/institutional/GovernancePill';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

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
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <p className="text-[10px] font-semibold tracking-wide text-st-faint">{terms.instLabel}</p>
      <h1 className="font-display text-2xl font-semibold text-st-ink">{terms.hw}</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
              filter === f ? 'bg-st-accent text-white' : 'bg-st-surface2 text-st-muted'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="mt-8 h-32 shimmer rounded-2xl" />
      ) : (data?.items ?? []).length === 0 ? (
        <EmptyState
          icon="📚"
          title={filter === 'all' ? 'No homework yet' : `Nothing ${filter.replace('_', ' ')}`}
          description={
            filter === 'all'
              ? 'When your teacher assigns work, it will appear here.'
              : 'Try another filter to see other assignments.'
          }
        />
      ) : (
        <div className="mt-6 space-y-3">
          {((data?.items ?? []) as HomeworkListItemDto[]).map((item) => (
            <Link key={item.id} href={`/homework/${item.id}`}>
              <Card className="transition hover:border-st-accent/40">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-st-ink">{item.title}</p>
                    <p className="text-xs text-st-muted">
                      {item.subjectLabel} · {item.teacherName} · {item.dueLabel}
                    </p>
                  </div>
                  <GovernancePill label={item.badge.label} tone={item.badge.tone} />
                </div>
                <p className="mt-2 text-xs text-st-muted">
                  {item.answeredCount}/{item.questionCount} answered
                  {item.late && ' · Late'}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
