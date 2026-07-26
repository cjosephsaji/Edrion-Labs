'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button, Card, StatCard, StatusBadge, TableSkeleton, EmptyState, ErrorState, Select } from '@edrion/ui';
import { useRegistrationRequests, useRegistrationsSummary } from '@edrion/api-client';
import { InstitutionType, RegistrationStatus } from '@edrion/shared-types';
import { Topbar } from '@/components/app-shell/topbar';

const PAGE_SIZE = 25;
const STATUS_FILTERS = ['', ...Object.values(RegistrationStatus)];
const TYPE_FILTERS = ['', ...Object.values(InstitutionType)];

export default function RegistrationRequestsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const search = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const type = params.get('type') ?? '';
  const page = Number(params.get('page') ?? '1');

  const [searchInput, setSearchInput] = useState(search);

  const setParam = useCallback(
    (next: Record<string, string | number | undefined>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === undefined || v === '') sp.delete(k);
        else sp.set(k, String(v));
      }
      router.replace(`/registration-requests?${sp.toString()}`);
    },
    [params, router],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== search) setParam({ search: searchInput, page: 1 });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search, setParam]);

  const summary = useRegistrationsSummary();
  const { data, isLoading, isError, isFetching } = useRegistrationRequests({
    search: search || undefined,
    status: status || undefined,
    type: type || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const total = summary.data ? Object.values(summary.data).reduce((a, b) => a + b, 0) : 0;
  const get = (k: string) => summary.data?.[k] ?? 0;

  return (
    <>
      <Topbar title="Registration Requests" actions={<span />} />
      <div className="page-enter space-y-5 p-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total" value={total} />
          <StatCard label="Submitted" value={get('submitted')} />
          <StatCard label="Under review" value={get('under_review')} />
          <StatCard label="Approved" value={get('approved')} />
          <StatCard label="Rejected" value={get('rejected')} />
          <StatCard label="Drafts" value={get('draft')} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, email or reference…"
              className="h-input w-72 rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
          <Select
            value={status}
            onChange={(e) => setParam({ status: e.target.value, page: 1 })}
            className="h-input w-auto min-w-[10rem]"
            options={STATUS_FILTERS.map((s) => ({
              value: s,
              label: s === '' ? 'All statuses' : s.replace(/_/g, ' '),
            }))}
          />
          <Select
            value={type}
            onChange={(e) => setParam({ type: e.target.value, page: 1 })}
            className="h-input w-auto min-w-[10rem]"
            options={TYPE_FILTERS.map((s) => ({
              value: s,
              label: s === '' ? 'All types' : s.replace(/_/g, ' '),
            }))}
          />
          {isFetching && <span className="text-xs text-text-muted">Updating…</span>}
        </div>

        <Card className="overflow-hidden">
          {isLoading ? (
            <TableSkeleton rows={8} cols={7} />
          ) : isError ? (
            <div className="p-6">
              <ErrorState description="Could not load registration requests. Confirm the API is running on :3001." />
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No registration requests"
                description={search || status || type ? 'Try clearing filters.' : 'New institution applications will appear here.'}
              />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="h-table-header border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <th className="px-4">Institution</th>
                  <th className="px-4">Type</th>
                  <th className="px-4">Country</th>
                  <th className="px-4">Primary contact</th>
                  <th className="px-4 text-right">Students</th>
                  <th className="px-4">Status</th>
                  <th className="px-4 text-right">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((r) => (
                  <tr
                    key={r.id}
                    className="h-table-row cursor-pointer transition-colors hover:bg-background-secondary"
                    onClick={() => router.push(`/registration-requests/${r.id}`)}
                  >
                    <td className="px-4">
                      <Link
                        href={`/registration-requests/${r.id}`}
                        className="font-medium text-text-primary hover:text-primary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.displayName ?? r.legalName ?? 'Untitled application'}
                      </Link>
                      <div className="text-xs text-text-muted">{r.publicRef ?? 'Draft'}</div>
                    </td>
                    <td className="px-4 capitalize text-text-secondary">{r.type?.replace(/_/g, ' ') ?? '—'}</td>
                    <td className="px-4 text-text-secondary">{r.country ?? '—'}</td>
                    <td className="px-4">
                      <div className="text-text-primary">{r.contactName ?? '—'}</div>
                      <div className="text-xs text-text-muted">{r.contactEmail ?? ''}</div>
                    </td>
                    <td className="px-4 text-right text-text-secondary">
                      {r.expectedStudents?.toLocaleString() ?? '—'}
                    </td>
                    <td className="px-4">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 text-right text-text-muted">
                      {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : '—'}
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
