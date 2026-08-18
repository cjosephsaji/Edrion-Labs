'use client';

import React from 'react';
import Link from 'next/link';
import { ListTodo } from 'lucide-react';
import { ActionButton, Card, PageHeader, StatusPill, type StatusTone } from '@/components/design-system';
import { EmptyState, ErrorState, LoadingBlock, UnauthorizedState } from '@/components/ui/states';
import { StudentApiError, formatApiError } from '@/lib/api-client';
import { useStudentList, useStudentMe } from '@/lib/hooks';

type Filter = 'all' | 'progress' | 'submitted' | 'returned';
type Row = {
  id: string;
  title: string;
  subjectName: string | null;
  dueAt: string | null;
  status: string | null;
  late?: boolean;
};

function statusStyle(status: string, late: boolean) {
  if (late || status === 'late') return { label: 'Late', tone: 'critical' as StatusTone };
  if (status === 'graded' || status === 'returned') return { label: 'Returned', tone: 'positive' as StatusTone };
  if (status === 'submitted') return { label: 'Submitted', tone: 'info' as StatusTone };
  if (status === 'in_progress') return { label: 'In progress', tone: 'warning' as StatusTone };
  return { label: 'Assigned', tone: 'neutral' as StatusTone };
}

function dueLabel(value: string | null) {
  if (!value) return 'No due date';
  const due = new Date(value);
  const today = new Date();
  const delta = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (delta === 0) return 'Due today';
  if (delta === 1) return 'Due tomorrow';
  if (delta > 1 && delta < 7) return `Due in ${delta} days`;
  return `Due ${new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(due)}`;
}

export function AssignmentListScreen({ kind }: { kind: 'assignments' | 'homework' }) {
  const [filter, setFilter] = React.useState<Filter>('all');
  const { data: me } = useStudentMe();
  const query = useStudentList<{ items: Row[] }>(`${kind}-${filter}`, `/student/${kind}?filter=${filter}`);
  const college = Boolean(me?.programmeName);
  const title = kind === 'homework' ? 'Homework' : 'Assignments';
  const institutionLabel = college ? 'COLLEGE' : 'SCHOOL';

  if (query.isLoading) return <LoadingBlock label={`Loading ${title.toLowerCase()}…`} />;
  if (query.error instanceof StudentApiError && query.error.status === 401) return <UnauthorizedState />;
  if (query.error) return <ErrorState description={formatApiError(query.error)} onRetry={() => void query.refetch()} />;

  const rows = query.data?.items ?? [];
  const filters: Array<{ id: Filter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'progress', label: 'In progress' },
    { id: 'submitted', label: 'Submitted' },
    { id: 'returned', label: 'Returned' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1120px]">
      <PageHeader
        eyebrow={`${title} · From your ${institutionLabel}`}
        title={title}
        description={`Review what needs attention, what is underway, and what your ${college ? 'professor' : 'teacher'} has returned.`}
      />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label={`${title} filters`}>
        {filters.map((item) => (
          <ActionButton
            key={item.id}
            role="tab"
            aria-selected={filter === item.id}
            onClick={() => setFilter(item.id)}
            variant={filter === item.id ? 'primary' : 'secondary'}
          >
            {item.label}
          </ActionButton>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="mt-4"><EmptyState icon={ListTodo} title={`No ${filter === 'all' ? title.toLowerCase() : filter} work`} description={filter === 'all' ? `Published ${title.toLowerCase()} will appear here.` : 'This filter is clear. Show all work to check another status.'} action={filter === 'all' ? undefined : <ActionButton variant="secondary" onClick={() => setFilter('all')}>Show all work</ActionButton>} /></div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {rows.map((row, index) => {
            const status = statusStyle(row.status ?? 'assigned', Boolean(row.late));
            const urgent = Boolean(row.late) || row.status === 'late';
            return (
              <Link
                key={row.id}
                href={`/${kind}/${row.id}`}
                className="focus-ring animate-block-in block"
                data-petros-target={index === 0 ? 'primary' : undefined}
                data-petros-title={index === 0 ? row.title : undefined}
                data-petros-message={index === 0 ? dueLabel(row.dueAt) : undefined}
                data-petros-source-id={index === 0 && kind === 'assignments' ? row.id : undefined}
                data-petros-href={index === 0 ? `/${kind}/${row.id}` : undefined}
                style={{ animationDelay: `${Math.min(index * 35, 140)}ms` }}
              >
                <Card variant={urgent ? 'urgent' : 'default'} interactive className="flex min-h-[148px] flex-col justify-between">
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h2 className="text-xl leading-tight text-[var(--s-ink)]">{row.title || 'Untitled'}</h2>
                      <StatusPill label={status.label} tone={status.tone} />
                    </div>
                    <p className="mt-2 text-sm text-[var(--s-muted)]">{[row.subjectName, kind === 'homework' ? 'Homework set' : 'Published assignment'].filter(Boolean).join(' · ')}</p>
                  </div>
                  <p className={`mt-6 text-base font-semibold ${urgent ? 'text-[var(--s-danger)]' : 'text-[var(--s-inkSoft)]'}`}>{dueLabel(row.dueAt)}</p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <p className="mt-4 max-w-[72ch] border-l-2 border-[var(--s-bd2)] px-4 py-2 text-sm leading-6 text-[var(--s-muted)]">
        Your work stays editable until you submit. Nothing sends to your {college ? 'professor' : 'teacher'} until you say so.
      </p>
    </div>
  );
}
