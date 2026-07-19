'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Card, StatCard, TableSkeleton, EmptyState, ErrorState, Select } from '@edrion/ui';
import { useInstitutionUsers, useInstitutionUsersSummary } from '@edrion/api-client';
import { INSTITUTION_DEFAULT_ROLES } from '@edrion/permissions/institution';
import { AccountStatus } from '@edrion/shared-types';
import { Topbar } from '@/components/app-shell/topbar';
import { InstitutionUsersTable } from '@/components/institution-users/institution-users-table';

const PAGE_SIZE = 25;
const STATUS_FILTERS = ['', ...Object.values(AccountStatus)];
const SECURITY_FILTERS = [
  { value: '', label: 'All security' },
  { value: 'mfa_missing', label: 'No MFA' },
  { value: 'mfa_required', label: 'MFA required' },
  { value: 'locked', label: 'Locked' },
  { value: 'password_reset', label: 'Password reset pending' },
  { value: 'disabled', label: 'Disabled' },
];
const ACTIVITY_FILTERS = [
  { value: '', label: 'Any activity' },
  { value: 'active_7d', label: 'Active last 7d' },
  { value: 'active_30d', label: 'Active last 30d' },
  { value: 'inactive_30d', label: 'Inactive 30d+' },
  { value: 'never', label: 'Never logged in' },
];

const selectClass =
  'h-input rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

export default function InstitutionUsersPage() {
  const router = useRouter();
  const params = useSearchParams();
  const search = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const roleKey = params.get('roleKey') ?? '';
  const security = params.get('security') ?? '';
  const lastActivity = params.get('lastActivity') ?? '';
  const invitation = params.get('invitation') ?? '';
  const page = Number(params.get('page') ?? '1');

  const [searchInput, setSearchInput] = useState(search);

  const setParam = useCallback(
    (next: Record<string, string | number | undefined>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === undefined || v === '') sp.delete(k);
        else sp.set(k, String(v));
      }
      router.replace(`/institution-users?${sp.toString()}`);
    },
    [params, router],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== search) setParam({ search: searchInput, page: 1 });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search, setParam]);

  const summary = useInstitutionUsersSummary();
  const { data, isLoading, isError, isFetching } = useInstitutionUsers({
    search: search || undefined,
    status: status || undefined,
    roleKey: roleKey || undefined,
    security: (security || undefined) as never,
    lastActivity: (lastActivity || undefined) as never,
    invitation: (invitation || undefined) as never,
    page,
    pageSize: PAGE_SIZE,
  });

  const get = (k: string) => summary.data?.[k] ?? 0;
  const total = summary.data ? Object.values(summary.data).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <Topbar title="Institution Users" />
      <div className="page-enter space-y-5 p-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Total" value={total} />
          <StatCard label="Active" value={get('active')} />
          <StatCard label="Invited" value={get('invited')} />
          <StatCard label="Disabled" value={get('disabled')} />
          <StatCard label="Locked" value={get('locked')} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name or email…"
              className="h-input w-64 rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
          <Select value={status} onChange={(e) => setParam({ status: e.target.value, page: 1 })} className={`${selectClass} w-auto min-w-[10rem]`} options={STATUS_FILTERS.map((s) => ({ value: s, label: s === '' ? 'All statuses' : s.replace(/_/g, ' ') }))} />
          <Select value={roleKey} onChange={(e) => setParam({ roleKey: e.target.value, page: 1 })} className={`${selectClass} w-auto min-w-[10rem]`} options={[{ value: '', label: 'All roles' }, ...INSTITUTION_DEFAULT_ROLES.map((r) => ({ value: r.key, label: r.name }))]} />
          <Select value={security} onChange={(e) => setParam({ security: e.target.value, page: 1 })} className={`${selectClass} w-auto min-w-[10rem]`} options={SECURITY_FILTERS} />
          <Select value={lastActivity} onChange={(e) => setParam({ lastActivity: e.target.value, page: 1 })} className={`${selectClass} w-auto min-w-[10rem]`} options={ACTIVITY_FILTERS} />
          {isFetching && <span className="text-xs text-text-muted">Updating…</span>}
        </div>

        <Card className="overflow-hidden">
          {isLoading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : isError ? (
            <div className="p-6">
              <ErrorState description="Could not load institution users. Confirm the API is running on :3001." />
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No institution users found"
                description="Invite users from an institution’s Users tab, or clear the active filters."
              />
            </div>
          ) : (
            <InstitutionUsersTable users={data.items} />
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
