'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { StudentAssignmentListItemDto } from '@edrion/schemas';
import { useAssignmentsList, useStudentMe } from '@/lib/hooks';
import { GovernancePill } from '@/components/institutional/GovernancePill';
import { Card } from '@/components/ui/card';

const FILTERS = ['all', 'progress', 'submitted', 'returned'] as const;

export default function AssignmentsPage() {
  const router = useRouter();
  const { data: me } = useStudentMe();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const { data, isLoading } = useAssignmentsList(filter);

  useEffect(() => {
    if (me?.persona === 'school') router.replace('/homework');
  }, [me?.persona, router]);

  if (me?.persona === 'school') return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <p className="text-[10px] font-semibold tracking-wide text-st-faint">YOUR COLLEGE</p>
      <h1 className="font-display text-2xl font-semibold text-st-ink">Assignments</h1>

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
      ) : (
        <div className="mt-6 space-y-3">
          {((data?.items ?? []) as StudentAssignmentListItemDto[]).map((item) => (
            <Link key={item.id} href={`/assignments/${item.id}`}>
              <Card className="transition hover:border-st-accent/40">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-st-ink">{item.title}</p>
                    <p className="text-xs text-st-muted">
                      {item.courseCode} · {item.professorName} · {item.dueLabel}
                    </p>
                  </div>
                  <GovernancePill label={item.badge.label} tone={item.badge.tone} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
