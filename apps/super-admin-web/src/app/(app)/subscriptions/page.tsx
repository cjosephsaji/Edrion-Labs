'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import {
  Card,
  StatCard,
  StatusBadge,
  TableSkeleton,
  EmptyState,
  ErrorState,
  Button,
} from '@edrion/ui';
import { useSubscriptions, useSubscriptionsSummary } from '@edrion/api-client';
import { SubscriptionStatus, BillingCycle } from '@edrion/shared-types';
import { Topbar } from '@/components/app-shell/topbar';
import { formatMinor } from '@/lib/format';

const PAGE_SIZE = 25;
const STATUS_FILTERS = ['', ...Object.values(SubscriptionStatus)];

export default function SubscriptionsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const search = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const cycle = params.get('billingCycle') ?? '';
  const page = Number(params.get('page') ?? '1');
  const [searchInput, setSearchInput] = useState(search);

  const setParam = useCallback(
    (next: Record<string, string | number | undefined>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === undefined || v === '') sp.delete(k);
        else sp.set(k, String(v));
      }
      router.replace(`/subscriptions?${sp.toString()}`);
    },
    [params, router],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== search) setParam({ search: searchInput, page: 1 });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search, setParam]);

  const summary = useSubscriptionsSummary();
  const { data, isLoading, isError, isFetching } = useSubscriptions({
    search: search || undefined,
    status: status || undefined,
    billingCycle: cycle || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const total = summary.data ? Object.values(summary.data).reduce((a, b) => a + b, 0) : 0;
  const get = (k: string) => summary.data?.[k] ?? 0;

  return (
    <>
      <Topbar title="Subscriptions" actions={<span />} />
      <div className="page-enter space-y-5 p-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total" value={total} />
          <StatCard label="Active" value={get('active')} />
          <StatCard label="Trial" value={get('trial')} />
          <StatCard label="Past due" value={get('past_due')} />
          <StatCard label="Paused" value={get('paused')} />
          <StatCard label="Cancelled" value={get('cancelled')} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by institution…"
              className="h-input w-72 rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
          <select value={status} onChange={(e) => setParam({ status: e.target.value, page: 1 })} className="h-input rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>{s === '' ? 'All statuses' : s.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <select value={cycle} onChange={(e) => setParam({ billingCycle: e.target.value, page: 1 })} className="h-input rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
            <option value="">All cycles</option>
            {Object.values(BillingCycle).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {isFetching && <span className="text-xs text-text-muted">Updating…</span>}
        </div>

        <Card className="overflow-hidden">
          {isLoading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : isError ? (
            <div className="p-6"><ErrorState description="Could not load subscriptions. Confirm the API is running on :3001." /></div>
          ) : !data || data.items.length === 0 ? (
            <div className="p-6"><EmptyState title="No subscriptions found" description={search || status || cycle ? 'Try clearing filters.' : 'Subscriptions appear here once institutions are on a plan.'} /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="h-table-header border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <th className="px-4">Institution</th>
                  <th className="px-4">Plan</th>
                  <th className="px-4">Status</th>
                  <th className="px-4">Cycle</th>
                  <th className="px-4 text-right">Base price</th>
                  <th className="px-4 text-right">Period ends</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((s) => (
                  <tr key={s.id} className="h-table-row cursor-pointer transition-colors hover:bg-background-secondary" onClick={() => router.push(`/subscriptions/${s.id}`)}>
                    <td className="px-4">
                      <Link href={`/subscriptions/${s.id}`} className="font-medium text-text-primary hover:text-primary" onClick={(e) => e.stopPropagation()}>
                        {s.institutionName ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 text-text-secondary">{s.planName ?? '—'}</td>
                    <td className="px-4"><StatusBadge status={s.status} /></td>
                    <td className="px-4 capitalize text-text-secondary">{s.billingCycle}</td>
                    <td className="px-4 text-right tabular-nums text-text-secondary">{formatMinor(s.basePriceMinor, s.currency)}</td>
                    <td className="px-4 text-right text-text-muted">{new Date(s.periodEnd).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm text-text-secondary">
            <span>Page {page} of {Math.ceil(data.total / PAGE_SIZE)} · {data.total} total</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setParam({ page: page - 1 })}><ChevronLeft className="h-4 w-4" /> Prev</Button>
              <Button variant="secondary" size="sm" disabled={!data.hasMore} onClick={() => setParam({ page: page + 1 })}>Next <ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
