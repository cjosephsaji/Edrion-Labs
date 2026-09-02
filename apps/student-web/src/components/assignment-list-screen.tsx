'use client';

import React from 'react';
import Link from 'next/link';
import { ListTodo } from 'lucide-react';
import { ActionButton, Card, PageHeader, StatusPill, type StatusTone } from '@/components/design-system';
import { PetrosAskButton } from '@/components/petros/petros-ask-button';
import { usePetrosPage } from '@/components/petros/petros-companion-context';
import { EmptyState, ErrorState, LoadingBlock, UnauthorizedState } from '@/components/ui/states';
import { StudentApiError, formatApiError } from '@/lib/api-client';
import { useStudentList, useStudentMe } from '@/lib/hooks';

type Filter = 'all' | 'progress' | 'submitted' | 'returned';
export type AssignmentRow = {
  id: string;
  title: string;
  subjectName: string | null;
  dueAt: string | null;
  status: string | null;
  late?: boolean;
};

type CourseworkRow = AssignmentRow & {
  sourceKind: 'assignments' | 'homework';
};

/**
 * The first unfinished row, used only to order the list's own emphasis. It is no longer
 * what Petros talks about: the student picks that with "Ask Petros" on the card they mean.
 */
export function petrosAssignmentFocusId(rows: AssignmentRow[]) {
  return rows.find((row) => ['assigned', 'in_progress'].includes(row.status ?? 'assigned'))?.id ?? null;
}

export function assignmentEmptyTitle(kind: 'assignments' | 'homework', filter: Filter) {
  if (filter !== 'all') return `No ${filter} work`;
  return kind === 'homework' ? 'No homework yet' : 'No assignments yet';
}

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
  const { data: me, isLoading: meLoading } = useStudentMe();
  const college = Boolean(me?.programmeName);
  const canViewHomework = Boolean(
    me?.permissions.includes('*') || me?.permissions.includes('student.homework.view'),
  );
  // College coursework is authored through both assignment generations. The college shell hides
  // the separate Homework destination, so its rows must be included on the visible Assignments
  // page or submitted/returned classwork becomes unreachable from every filter.
  const includeHomework = kind === 'assignments' && college && canViewHomework;
  const assignmentsQuery = useStudentList<{ items: AssignmentRow[] }>(
    ['assignments', filter],
    `/student/assignments?filter=${filter}`,
    kind === 'assignments',
  );
  const homeworkQuery = useStudentList<{ items: AssignmentRow[] }>(
    ['homework', filter],
    `/student/homework?filter=${filter}`,
    kind === 'homework' || includeHomework,
  );
  const title = kind === 'homework' ? 'Homework' : 'Assignments';
  const activeQueries = kind === 'homework'
    ? [homeworkQuery]
    : includeHomework
      ? [assignmentsQuery, homeworkQuery]
      : [assignmentsQuery];
  const queryError = activeQueries.find((query) => query.error)?.error;
  const isLoading = meLoading || activeQueries.some((query) => query.isLoading);
  const allRows: CourseworkRow[] = [
    ...(kind === 'assignments'
      ? (assignmentsQuery.data?.items ?? []).map((row) => ({ ...row, sourceKind: 'assignments' as const }))
      : []),
    ...(kind === 'homework' || includeHomework
      ? (homeworkQuery.data?.items ?? []).map((row) => ({ ...row, sourceKind: 'homework' as const }))
      : []),
  ];

  usePetrosPage(
    !isLoading && !queryError
      ? {
          title,
          summary: `${allRows.length} ${title.toLowerCase()} shown, filter: ${filter}`,
          candidates: allRows.map((row) => ({
            ref: row.id,
            entityType: row.sourceKind === 'homework' ? ('homework' as const) : ('assignment' as const),
            entityId: row.id,
            title: row.title || 'Untitled',
            summary: [row.subjectName, dueLabel(row.dueAt), row.status ?? 'assigned']
              .filter(Boolean)
              .join(' · '),
            href: `/${row.sourceKind}/${row.id}`,
          })),
        }
      : null,
  );

  if (isLoading) return <LoadingBlock label={`Loading ${title.toLowerCase()}…`} />;
  if (queryError instanceof StudentApiError && queryError.status === 401) return <UnauthorizedState />;
  if (queryError) return <ErrorState description={formatApiError(queryError)} onRetry={() => {
    for (const query of activeQueries) void query.refetch();
  }} />;

  const rows = allRows;
  const filters: Array<{ id: Filter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'progress', label: 'In progress' },
    { id: 'submitted', label: 'Submitted' },
    { id: 'returned', label: 'Returned' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1120px]">
      <PageHeader
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
        <div className="mt-4"><EmptyState icon={ListTodo} title={assignmentEmptyTitle(kind, filter)} description={filter === 'all' ? `Published ${title.toLowerCase()} will appear here.` : 'This filter is clear. Show all work to check another status.'} action={filter === 'all' ? undefined : <ActionButton variant="secondary" onClick={() => setFilter('all')}>Show all work</ActionButton>} /></div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {rows.map((row, index) => {
            const status = statusStyle(row.status ?? 'assigned', Boolean(row.late));
            const urgent = Boolean(row.late) || row.status === 'late';
            return (
              <Link
                key={row.id}
                href={`/${row.sourceKind}/${row.id}`}
                data-petros-card
                className="focus-ring animate-block-in block"
                style={{ animationDelay: `${Math.min(index * 35, 140)}ms` }}
              >
                <Card variant={urgent ? 'urgent' : 'default'} interactive className="flex min-h-[148px] flex-col justify-between">
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h2 className="text-xl leading-tight text-[var(--s-ink)]">{row.title || 'Untitled'}</h2>
                      <StatusPill label={status.label} tone={status.tone} />
                    </div>
                    <p className="mt-2 text-sm text-[var(--s-muted)]">{[row.subjectName, row.sourceKind === 'homework' ? 'Homework set' : 'Published assignment'].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="mt-6 flex items-center justify-between gap-3">
                    <p className={`text-base font-semibold ${urgent ? 'text-[var(--s-danger)]' : 'text-[var(--s-inkSoft)]'}`}>{dueLabel(row.dueAt)}</p>
                    <PetrosAskButton candidateRef={row.id} label={row.title || 'Untitled'} variant="icon" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
