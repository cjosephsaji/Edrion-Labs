'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Card, StatCard, StatusBadge, TableSkeleton, EmptyState, ErrorState, Button, Select } from '@edrion/ui';
import { useFeatures, useFeaturesSummary } from '@edrion/api-client';
import { FeatureDefinitionStatus } from '@edrion/shared-types';
import { Topbar } from '@/components/app-shell/topbar';
import { CreateFeatureDialog } from '@/components/features/create-feature-dialog';

const PAGE_SIZE = 25;
const STATUS_FILTERS = ['', ...Object.values(FeatureDefinitionStatus)];

export default function FeaturesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const search = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const releaseStage = params.get('releaseStage') ?? '';
  const page = Number(params.get('page') ?? '1');

  const [searchInput, setSearchInput] = useState(search);

  const setParam = useCallback(
    (next: Record<string, string | number | undefined>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === undefined || v === '') sp.delete(k);
        else sp.set(k, String(v));
      }
      router.replace(`/features?${sp.toString()}`);
    },
    [params, router],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== search) setParam({ search: searchInput, page: 1 });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search, setParam]);

  const summary = useFeaturesSummary();
  const { data, isLoading, isError, isFetching } = useFeatures({
    search: search || undefined,
    status: status || undefined,
    releaseStage: releaseStage || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const total = summary.data ? Object.values(summary.data).reduce((a, b) => a + b, 0) : 0;
  const get = (k: string) => summary.data?.[k] ?? 0;

  return (
    <>
      <Topbar
        title="Feature Controls"
        actions={<CreateFeatureDialog onCreated={(f) => router.push(`/features/${f.id}`)} />}
      />
      <div className="page-enter space-y-5 p-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Total features" value={total} />
          <StatCard label="Active" value={get('active')} />
          <StatCard label="Inactive" value={get('inactive')} />
          <StatCard label="Archived" value={get('archived')} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or key…"
              className="h-input w-72 rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
          <Select
            value={status}
            onChange={(e) => setParam({ status: e.target.value, page: 1 })}
            className="h-input w-auto min-w-[10rem]"
            options={STATUS_FILTERS.map((s) => ({ value: s, label: s === '' ? 'All statuses' : s }))}
          />
          <Select
            value={releaseStage}
            onChange={(e) => setParam({ releaseStage: e.target.value, page: 1 })}
            className="h-input w-auto min-w-[10rem]"
            options={[
              { value: '', label: 'All stages' },
              { value: 'internal', label: 'Internal' },
              { value: 'alpha', label: 'Alpha' },
              { value: 'beta', label: 'Beta' },
              { value: 'ga', label: 'GA' },
              { value: 'deprecated', label: 'Deprecated' },
            ]}
          />
          {isFetching && <span className="text-xs text-text-muted">Updating…</span>}
        </div>

        <Card className="overflow-hidden">
          {isLoading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : isError ? (
            <div className="p-6">
              <ErrorState description="Could not load features. Confirm the API is running on :3001." />
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No features found"
                description={search || status || releaseStage ? 'Try clearing filters.' : 'Register your first feature to get started.'}
              />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="h-table-header border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <th className="px-4">Feature</th>
                  <th className="px-4">Module</th>
                  <th className="px-4">Stage</th>
                  <th className="px-4">Status</th>
                  <th className="px-4 text-center">Default</th>
                  <th className="px-4 text-right">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((f) => (
                  <tr
                    key={f.id}
                    className="h-table-row cursor-pointer transition-colors hover:bg-background-secondary"
                    onClick={() => router.push(`/features/${f.id}`)}
                  >
                    <td className="px-4">
                      <Link
                        href={`/features/${f.id}`}
                        className="font-medium text-text-primary hover:text-primary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {f.name}
                      </Link>
                      <div className="text-xs text-text-muted">{f.key}</div>
                    </td>
                    <td className="px-4 text-text-secondary">{f.module}</td>
                    <td className="px-4 capitalize text-text-secondary">{f.releaseStage}</td>
                    <td className="px-4">
                      <StatusBadge status={f.status} />
                    </td>
                    <td className="px-4 text-center">
                      <span className={f.defaultValue ? 'text-success' : 'text-text-muted'}>
                        {f.defaultValue ? 'ON' : 'OFF'}
                      </span>
                    </td>
                    <td className="px-4 text-right text-text-muted">
                      {new Date(f.updatedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm text-text-secondary">
            <span>
              Page {page} of {Math.ceil(data.total / PAGE_SIZE)} · {data.total} total
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setParam({ page: page - 1 })}>
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <Button variant="secondary" size="sm" disabled={!data.hasMore} onClick={() => setParam({ page: page + 1 })}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
