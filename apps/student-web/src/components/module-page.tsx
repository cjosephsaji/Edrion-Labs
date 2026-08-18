'use client';

import type { ReactNode } from 'react';
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  UnauthorizedState,
} from '@/components/ui/states';
import { StudentApiError, formatApiError } from '@/lib/api-client';
import { useStudentList } from '@/lib/hooks';

function asItems<T extends { id: string }>(data: unknown): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  for (const key of [
    'items',
    'occurrences',
    'invoices',
    'subjects',
    'rows',
    'events',
    'assignments',
    'receipts',
  ]) {
    const value = obj[key];
    if (Array.isArray(value)) {
      return value.map((row, index) => {
        const r = row as Record<string, unknown>;
        if (r.id) return row as T;
        return {
          ...r,
          id: String(r.subjectClassId ?? r.invoiceNo ?? r.date ?? index),
        } as T;
      });
    }
  }
  // Calendar month payload: flatten days[].events
  if (Array.isArray(obj.days)) {
    const out: T[] = [];
    for (const day of obj.days as Array<{ date?: string; events?: unknown[] }>) {
      for (const [index, event] of (day.events ?? []).entries()) {
        const r = (event ?? {}) as Record<string, unknown>;
        out.push({
          ...r,
          id: String(r.id ?? `${day.date ?? 'day'}-${index}`),
          date: day.date,
          title: r.label ?? r.title,
        } as unknown as T);
      }
    }
    return out;
  }
  return [];
}

export function ModuleListPage<T extends { id: string }>({
  title,
  description,
  path,
  queryKey,
  emptyTitle,
  emptyDescription,
  renderItem,
}: {
  title: string;
  description?: string;
  path: string;
  queryKey: string;
  emptyTitle: string;
  emptyDescription?: string;
  renderItem: (item: T) => ReactNode;
}) {
  const q = useStudentList<unknown>(queryKey, path);

  if (q.isLoading) return <LoadingBlock />;
  if (q.error instanceof StudentApiError && q.error.status === 401) {
    return <UnauthorizedState />;
  }
  if (
    q.error instanceof StudentApiError &&
    (q.error.status === 403 ||
      q.error.code === 'NO_PERMISSION' ||
      q.error.code === 'MODULE_DISABLED' ||
      q.error.code === 'PORTAL_DISABLED')
  ) {
    return (
      <ErrorState
        title="You don’t have access"
        description="This module isn’t enabled for your account."
      />
    );
  }
  if (q.error) {
    return (
      <ErrorState description={formatApiError(q.error)} onRetry={() => void q.refetch()} />
    );
  }

  const items = asItems<T>(q.data);

  return (
    <div className="mx-auto w-full max-w-[1120px]">
      <PageHeader title={title} description={description} />
      {items.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <ul className="space-y-3">
          {items.map((item, index) => {
            const itemRecord = item as unknown as Record<string, unknown>;
            const itemTitle = String(itemRecord.title ?? itemRecord.name ?? title);
            return (
              <li
                key={item.id}
                data-petros-target={index === 0 ? 'primary' : undefined}
                data-petros-title={index === 0 ? itemTitle : undefined}
                data-petros-message={index === 0 ? `This is the first item in your ${title.toLowerCase()} list.` : undefined}
                data-petros-href={index === 0 ? path : undefined}
              >
                {renderItem(item)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
