'use client';
import { useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { Button, Card, CardContent, Skeleton, EmptyState, ErrorState, Select } from '@edrion/ui';
import { useActivityFeed, type ActivityFilter } from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';

const selectClass =
  'h-input rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

const RISK_DOT: Record<string, string> = {
  low: 'bg-text-muted',
  medium: 'bg-warning',
  high: 'bg-danger',
  critical: 'bg-danger',
};

export default function ActivityPage() {
  const [filter, setFilter] = useState<ActivityFilter>({ limit: 50 });
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useActivityFeed(filter);

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

  return (
    <>
      <Topbar title="Activity Centre" />
      <div className="page-enter space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={filter.category ?? ''}
            onChange={(e) => setFilter((f) => ({ ...f, category: e.target.value || undefined }))}
            placeholder="Category"
            className={selectClass + ' w-44'}
          />
          <Select
            value={filter.riskLevel ?? ''}
            onChange={(e) => setFilter((f) => ({ ...f, riskLevel: e.target.value || undefined }))}
            className={selectClass}
            options={[
              { value: '', label: 'All risk' },
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'critical', label: 'Critical' },
            ]}
          />
        </div>

        <Card>
          <CardContent className="pt-5">
            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : isError ? (
              <ErrorState description="Could not load the activity feed. Confirm the API is running on :3001." />
            ) : items.length === 0 ? (
              <EmptyState title="No activity yet" description="Activity from across the platform will appear here." />
            ) : (
              <ol className="relative space-y-4 border-l border-border pl-5">
                {items.map((e) => (
                  <li key={e.id} className="relative">
                    <span
                      className={`absolute -left-[1.4rem] top-1.5 h-2 w-2 rounded-full ${RISK_DOT[e.riskLevel] ?? 'bg-text-muted'}`}
                      aria-hidden
                    />
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm text-text-primary">{e.summary}</p>
                        <p className="mt-0.5 text-xs text-text-muted">
                          <span className="capitalize">{e.category}</span>
                          {e.actorName ? ` · ${e.actorName}` : ''}
                        </p>
                      </div>
                      <time className="shrink-0 text-xs text-text-muted">
                        {new Date(e.occurredAt).toLocaleString()}
                      </time>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {hasNextPage && (
          <div className="flex justify-center">
            <Button variant="secondary" size="sm" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
              <Activity className="h-4 w-4" /> Load more
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
