'use client';
import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, StatCard, TableSkeleton, EmptyState, ErrorState, Select } from '@edrion/ui';
import { useCampuses, useInstitutions } from '@edrion/api-client';
import { CampusBillingStatus } from '@edrion/shared-types';
import { Topbar } from '@/components/app-shell/topbar';
import { CampusesTable } from '@/components/campuses/campuses-table';
import { formatMinor } from '@/lib/format';

const PAGE_SIZE = 25;
const BILLING_FILTERS = ['', ...Object.values(CampusBillingStatus)];
const ACTIVE_FILTERS = [
  { value: '', label: 'All campuses' },
  { value: 'true', label: 'Active only' },
  { value: 'false', label: 'Inactive only' },
];

const selectClass =
  'h-input rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

export default function CampusesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const institutionId = params.get('institutionId') ?? '';
  const billingStatus = params.get('billingStatus') ?? '';
  const active = params.get('active') ?? '';
  const page = Number(params.get('page') ?? '1');

  const setParam = useCallback(
    (next: Record<string, string | number | undefined>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === undefined || v === '') sp.delete(k);
        else sp.set(k, String(v));
      }
      router.replace(`/campuses?${sp.toString()}`);
    },
    [params, router],
  );

  // Institution list powers the filter dropdown + maps ids → names in the table.
  const institutions = useInstitutions({ pageSize: 100 });
  const institutionNames = new Map(
    (institutions.data?.items ?? []).map((i) => [i.id, i.displayName] as const),
  );

  const activeBool = active === '' ? undefined : active === 'true';

  // Summary scope follows only the institution filter, so the cards always show the full
  // breakdown regardless of the billing/active filters applied to the table below.
  const summary = useCampuses({ institutionId: institutionId || undefined, pageSize: 100 });
  const summaryItems = summary.data?.items ?? [];
  const includedCount = summaryItems.filter((c) => c.billingStatus === CampusBillingStatus.Included).length;
  const paidCount = summaryItems.filter((c) => c.billingStatus === CampusBillingStatus.PaidAddon).length;
  const inactiveCount = summaryItems.filter((c) => !c.isActive).length;
  const addonRevenue = summaryItems
    .filter((c) => c.isActive && c.billingStatus === CampusBillingStatus.PaidAddon)
    .reduce((sum, c) => sum + (c.addonPriceMinor ?? 0), 0);

  const { data, isLoading, isError, isFetching } = useCampuses({
    institutionId: institutionId || undefined,
    billingStatus: billingStatus || undefined,
    active: activeBool,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <>
      <Topbar title="Campuses" />
      <div className="page-enter space-y-5 p-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Total" value={summary.data?.total ?? 0} />
          <StatCard label="Included" value={includedCount} />
          <StatCard label="Paid add-on" value={paidCount} />
          <StatCard label="Inactive" value={inactiveCount} />
          <StatCard label="Add-on revenue" value={formatMinor(addonRevenue)} hint="active paid campuses" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={institutionId}
            onChange={(e) => setParam({ institutionId: e.target.value, page: 1 })}
            className={`${selectClass} w-auto min-w-[12rem]`}
            options={[{ value: '', label: 'All institutions' }, ...(institutions.data?.items ?? []).map((i) => ({ value: i.id, label: i.displayName }))]}
          />
          <Select
            value={billingStatus}
            onChange={(e) => setParam({ billingStatus: e.target.value, page: 1 })}
            className={`${selectClass} w-auto min-w-[10rem]`}
            options={BILLING_FILTERS.map((s) => ({ value: s, label: s === '' ? 'All billing statuses' : s.replace(/_/g, ' ') }))}
          />
          <Select value={active} onChange={(e) => setParam({ active: e.target.value, page: 1 })} className={`${selectClass} w-auto min-w-[10rem]`} options={ACTIVE_FILTERS} />
          {isFetching && <span className="text-xs text-text-muted">Updating…</span>}
        </div>

        <Card className="overflow-hidden">
          {isLoading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : isError ? (
            <div className="p-6">
              <ErrorState description="Could not load campuses. Confirm the API is running on :3007." />
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No campuses found"
                description="Add campuses from an institution’s Campuses tab, or clear the active filters."
              />
            </div>
          ) : (
            <CampusesTable campuses={data.items} institutionNames={institutionNames} />
          )}
        </Card>

        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm text-text-secondary">
            <span>Page {page} of {Math.ceil(data.total / PAGE_SIZE)} · {data.total} total</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setParam({ page: page - 1 })}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <button
                disabled={!data.hasMore}
                onClick={() => setParam({ page: page + 1 })}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 disabled:opacity-50"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
